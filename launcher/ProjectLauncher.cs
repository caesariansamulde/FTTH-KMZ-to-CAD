using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

internal static class ProjectLauncher
{
    private const int Port = 5173;
    private const string Url = "http://127.0.0.1:5173/";

    [STAThread]
    private static void Main()
    {
        var root = AppDomain.CurrentDomain.BaseDirectory;
        if (!IsPortOpen())
        {
            try
            {
                var start = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/d /c npm.cmd run dev",
                    WorkingDirectory = root,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                };
                Process.Start(start);
            }
            catch (Exception error)
            {
                MessageBox.Show("Unable to start npm run dev.\n\n" + error.Message, "FTTH KMZ to CAD", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
        }

        for (var attempt = 0; attempt < 60; attempt++)
        {
            if (IsPortOpen())
            {
                Process.Start(new ProcessStartInfo(Url) { UseShellExecute = true });
                return;
            }
            Thread.Sleep(300);
        }

        MessageBox.Show("The Vite app did not start on " + Url + ".", "FTTH KMZ to CAD", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }

    private static bool IsPortOpen()
    {
        try
        {
            using (var client = new TcpClient())
            {
                var task = client.ConnectAsync("127.0.0.1", Port);
                return task.Wait(250) && client.Connected;
            }
        }
        catch
        {
            return false;
        }
    }
}
