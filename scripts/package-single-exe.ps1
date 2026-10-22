param(
  [string]$OutputPath = (Join-Path $PSScriptRoot "..\FTTH-KMZ-to-CAD.exe")
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$stageRoot = Join-Path $projectRoot ".package-stage"
$payloadDir = Join-Path $stageRoot "payload"
$zipPath = Join-Path $stageRoot "payload.zip"
$sourceCs = Join-Path $stageRoot "Program.cs"
$outputPath = [System.IO.Path]::GetFullPath($OutputPath)
$releaseExe = Join-Path $projectRoot "release\FTTH-KMZ-to-CAD.exe"
$nodeSource = Join-Path $projectRoot "release\iexpress\node.exe"

if (-not (Test-Path $nodeSource)) {
  $nodeSource = Join-Path $projectRoot "release\FTTH-KMZ-to-CAD\runtime\node.exe"
}

if (-not (Test-Path $nodeSource)) {
  throw "Bundled Node runtime not found at $nodeSource. Ensure node.exe is present."
}

$cscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $cscPath)) {
  $cscPath = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}
if (-not (Test-Path $cscPath)) {
  throw "Microsoft .NET C# compiler (csc.exe) not found."
}

Push-Location $projectRoot
try {
  Write-Host "1. Building web distribution..."
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw "Web build failed." }

  Write-Host "2. Staging files..."
  Remove-Item -LiteralPath $stageRoot -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $payloadDir -Force | Out-Null
  
  Copy-Item -LiteralPath (Join-Path $projectRoot "dist") -Destination (Join-Path $payloadDir "dist") -Recurse
  if (Test-Path (Join-Path $projectRoot "public")) {
    Copy-Item -LiteralPath (Join-Path $projectRoot "public") -Destination (Join-Path $payloadDir "public") -Recurse
  }
  New-Item -ItemType Directory -Path (Join-Path $payloadDir "scripts") -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $projectRoot "scripts\serve-dist.mjs") -Destination (Join-Path $payloadDir "scripts\serve-dist.mjs")
  Copy-Item -LiteralPath (Join-Path $projectRoot "scripts\convert-dwg.mjs") -Destination (Join-Path $payloadDir "scripts\convert-dwg.mjs")
  Copy-Item -LiteralPath (Join-Path $projectRoot "scripts\usage-logger.mjs") -Destination (Join-Path $payloadDir "scripts\usage-logger.mjs")
  
  if (Test-Path (Join-Path $projectRoot "LICENSE-AND-FAIR-USE.md")) {
    Copy-Item -LiteralPath (Join-Path $projectRoot "LICENSE-AND-FAIR-USE.md") -Destination (Join-Path $payloadDir "LICENSE-AND-FAIR-USE.md")
  }

  $runtimeDir = Join-Path $payloadDir "runtime"
  New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
  Copy-Item -LiteralPath $nodeSource -Destination (Join-Path $runtimeDir "node.exe")

  Write-Host "3. Compressing application archive..."
  Compress-Archive -Path "$payloadDir\*" -DestinationPath $zipPath -Force

  Write-Host "4. Generating launcher wrapper..."
  $versionTag = [DateTime]::UtcNow.ToString("yyyyMMddHHmmss")
  $csCode = @"
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net.Sockets;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

static class Program
{
    private const int Port = 4173;
    private const string Url = "http://127.0.0.1:4173/";
    private const string AppTitle = "FTTH KMZ to AutoCAD Converter";

    [STAThread]
    static void Main()
    {
        try
        {
            DateTime expiryDate = new DateTime(2027, 9, 2, 23, 59, 59, DateTimeKind.Utc);
            if (DateTime.UtcNow > expiryDate)
            {
                MessageBox.Show(
                    "This software build reached its 1-year expiration date on September 2, 2027.\n\nPlease contact the author (Caesar Ian Samulde) for a license renewal or updated release.",
                    AppTitle,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Stop
                );
                return;
            }

            string appDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "FTTH-KMZ-to-CAD");
            string markerFile = Path.Combine(appDir, ".version_$versionTag");

            bool needsUpdate = !Directory.Exists(appDir) || !File.Exists(markerFile);

            if (needsUpdate)
            {
                KillStaleServerProcesses(appDir);

                if (!Directory.Exists(appDir))
                {
                    Directory.CreateDirectory(appDir);
                }

                var assembly = Assembly.GetExecutingAssembly();
                using (var stream = assembly.GetManifestResourceStream("Payload.zip"))
                {
                    if (stream == null)
                    {
                        MessageBox.Show("Internal error: Embedded application payload is missing.", AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Error);
                        return;
                    }
                    using (var archive = new ZipArchive(stream))
                    {
                        foreach (var entry in archive.Entries)
                        {
                            string targetPath = Path.Combine(appDir, entry.FullName);
                            string dir = Path.GetDirectoryName(targetPath);
                            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                            {
                                Directory.CreateDirectory(dir);
                            }
                            if (!string.IsNullOrEmpty(entry.Name))
                            {
                                entry.ExtractToFile(targetPath, true);
                            }
                        }
                    }
                }
                File.WriteAllText(markerFile, "$versionTag");
            }
            else if (IsPortOpen("127.0.0.1", Port, 250))
            {
                Process.Start(new ProcessStartInfo(Url) { UseShellExecute = true });
                return;
            }

            string nodePath = Path.Combine(appDir, "runtime", "node.exe");
            if (!File.Exists(nodePath)) nodePath = Path.Combine(appDir, "node.exe");
            string scriptPath = Path.Combine(appDir, "scripts", "serve-dist.mjs");

            if (!File.Exists(nodePath) || !File.Exists(scriptPath))
            {
                MessageBox.Show("Corrupted installation: node or server script missing.", AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = nodePath,
                Arguments = "\"" + scriptPath + "\"",
                WorkingDirectory = appDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                WindowStyle = ProcessWindowStyle.Hidden
            };

            Process.Start(startInfo);

            bool serverReady = false;
            for (int i = 0; i < 40; i++)
            {
                Thread.Sleep(250);
                if (IsPortOpen("127.0.0.1", Port, 300))
                {
                    serverReady = true;
                    break;
                }
            }

            if (serverReady)
            {
                Process.Start(new ProcessStartInfo(Url) { UseShellExecute = true });
            }
            else
            {
                MessageBox.Show("FTTH KMZ to AutoCAD Server failed to start on port " + Port + ".", AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show("Error starting application:\n" + ex.Message, AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    static void KillStaleServerProcesses(string appDir)
    {
        try
        {
            foreach (var p in Process.GetProcessesByName("node"))
            {
                try
                {
                    p.Kill();
                }
                catch { }
            }
        }
        catch { }
    }

    static bool IsPortOpen(string host, int port, int timeoutMs)
    {
        try
        {
            using (var client = new TcpClient())
            {
                var result = client.BeginConnect(host, port, null, null);
                bool success = result.AsyncWaitHandle.WaitOne(timeoutMs);
                if (success && client.Connected)
                {
                    client.EndConnect(result);
                    return true;
                }
                return false;
            }
        }
        catch
        {
            return false;
        }
    }
}
"@
  Set-Content -LiteralPath $sourceCs -Value $csCode -Encoding UTF8

  Write-Host "5. Compiling standalone single EXE..."
  New-Item -ItemType Directory -Path (Split-Path $outputPath) -Force | Out-Null
  Remove-Item -LiteralPath $outputPath -Force -ErrorAction SilentlyContinue

  $cscArgs = @(
    "/target:winexe",
    "/optimize+",
    "/r:System.dll",
    "/r:System.IO.Compression.dll",
    "/r:System.IO.Compression.FileSystem.dll",
    "/r:System.Windows.Forms.dll",
    "/resource:`"$zipPath`",Payload.zip",
    "/out:`"$outputPath`"",
    "`"$sourceCs`""
  )

  & $cscPath $cscArgs
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $outputPath)) {
    throw "C# compiler failed to build the standalone EXE."
  }

  New-Item -ItemType Directory -Path (Split-Path $releaseExe) -Force | Out-Null
  Copy-Item -LiteralPath $outputPath -Destination $releaseExe -Force

  $sizeMb = [Math]::Round((Get-Item $outputPath).Length / 1MB, 2)
  Write-Host ""
  Write-Host "SUCCESS! Single Standalone EXE created ($sizeMb MB):"
  Write-Host "  -> $outputPath"
  Write-Host "  -> $releaseExe"
}
finally {
  Pop-Location
  Remove-Item -LiteralPath $stageRoot -Recurse -Force -ErrorAction SilentlyContinue
}
