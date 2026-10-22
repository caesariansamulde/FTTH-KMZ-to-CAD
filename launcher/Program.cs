using System.Diagnostics;
using System.Net.Sockets;

const int port = 4173;
const string url = "http://127.0.0.1:4173/";

var appRoot = AppContext.BaseDirectory;
var scriptPath = Path.Combine(appRoot, "scripts", "serve-dist.mjs");
var bundledNode = Path.Combine(appRoot, "runtime", "node.exe");
var nodePath = File.Exists(bundledNode) ? bundledNode : "node.exe";

if (!File.Exists(scriptPath))
{
    ShowError("The app package is incomplete. Missing scripts\\serve-dist.mjs beside the launcher.");
    return;
}

if (!await IsPortOpen(port))
{
    try
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = nodePath,
            WorkingDirectory = appRoot,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        startInfo.ArgumentList.Add(scriptPath);
        Process.Start(startInfo);
    }
    catch (Exception ex)
    {
        ShowError($"Unable to start the FTTH KMZ to CAD server.\n\n{ex.Message}");
        return;
    }
}

var ready = false;
for (var attempt = 0; attempt < 30; attempt += 1)
{
    if (await IsPortOpen(port))
    {
        ready = true;
        break;
    }

    await Task.Delay(300);
}

if (!ready)
{
    ShowError("The app server did not start on http://127.0.0.1:4173.");
    return;
}

Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });

static async Task<bool> IsPortOpen(int port)
{
    try
    {
        using var client = new TcpClient();
        var connectTask = client.ConnectAsync("127.0.0.1", port);
        var completed = await Task.WhenAny(connectTask, Task.Delay(250));
        return completed == connectTask && client.Connected;
    }
    catch
    {
        return false;
    }
}

static void ShowError(string message)
{
    try
    {
        File.WriteAllText(Path.Combine(AppContext.BaseDirectory, "launcher-error.txt"), message);
    }
    catch
    {
        // Ignore logging failures; the message box below is the primary notification.
    }

    System.Windows.Forms.MessageBox.Show(message, "FTTH KMZ to CAD", System.Windows.Forms.MessageBoxButtons.OK, System.Windows.Forms.MessageBoxIcon.Error);
}
