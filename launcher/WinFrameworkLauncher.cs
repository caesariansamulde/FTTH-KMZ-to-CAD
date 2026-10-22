using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

internal static class Program
{
    private const int Port = 4173;
    private const string Url = "http://127.0.0.1:4173/";

    [STAThread]
    private static void Main()
    {
        string appRoot = AppDomain.CurrentDomain.BaseDirectory;
        Log(appRoot, "Launcher started from " + appRoot);
        string scriptPath = Path.Combine(appRoot, "scripts", "serve-dist.mjs");
        string bundledNode = Path.Combine(appRoot, "runtime", "node.exe");
        string nodePath = File.Exists(bundledNode) ? bundledNode : "node.exe";
        Log(appRoot, "Node path: " + nodePath);
        Log(appRoot, "Script path: " + scriptPath);

        if (!File.Exists(scriptPath))
        {
            ShowError("The app package is incomplete. Missing scripts\\serve-dist.mjs beside the launcher.");
            return;
        }

        if (!IsAppReady())
        {
            try
            {
                Log(appRoot, "Port closed. Starting Node.");
                ProcessStartInfo startInfo = new ProcessStartInfo();
                startInfo.FileName = nodePath;
                startInfo.Arguments = Quote(scriptPath);
                startInfo.WorkingDirectory = appRoot;
                startInfo.UseShellExecute = false;
                startInfo.CreateNoWindow = true;
                Process serverProcess = Process.Start(startInfo);
                Log(appRoot, "Node start requested.");
                if (serverProcess != null)
                {
                    AppDomain.CurrentDomain.SetData("ServerProcess", serverProcess);
                }
            }
            catch (Exception ex)
            {
                Log(appRoot, "Node start failed: " + ex);
                ShowError("Unable to start the FTTH KMZ to CAD server.\n\n" + ex.Message);
                return;
            }
        }
        else
        {
            Log(appRoot, "Port already open.");
        }

        bool ready = false;
        for (int attempt = 0; attempt < 30; attempt += 1)
        {
            if (IsAppReady())
            {
                ready = true;
                Log(appRoot, "Port ready.");
                break;
            }

            Thread.Sleep(300);
        }

        if (!ready)
        {
            Log(appRoot, "Port did not become ready.");
            ShowError("The app server did not start on " + Url);
            return;
        }

        Log(appRoot, "Opening browser.");
        Process.Start(new ProcessStartInfo(Url) { UseShellExecute = true });
        Process runningServer = AppDomain.CurrentDomain.GetData("ServerProcess") as Process;
        if (runningServer != null)
        {
            Log(appRoot, "Keeping launcher alive until server exits.");
            runningServer.WaitForExit();
        }
    }

    private static bool IsAppReady()
    {
        try
        {
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(Url);
            request.Method = "HEAD";
            request.Timeout = 500;
            request.ReadWriteTimeout = 500;
            using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                return (int)response.StatusCode >= 200 && (int)response.StatusCode < 500;
        }
        catch
        {
            return false;
        }
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    private static void ShowError(string message)
    {
        try
        {
            File.WriteAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "launcher-error.txt"), message);
        }
        catch
        {
        }

        MessageBox.Show(message, "FTTH KMZ to CAD", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }

    private static void Log(string appRoot, string message)
    {
        try
        {
            File.AppendAllText(Path.Combine(appRoot, "launcher-log.txt"), DateTime.Now.ToString("s") + " " + message + Environment.NewLine);
        }
        catch
        {
        }
    }
}
