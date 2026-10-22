@echo off
setlocal

set "APPDIR=%~dp0"
set "URL=http://127.0.0.1:5173/"

pushd "%APPDIR%"

rem Reuse an already-running Vite server when possible.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$tcp=$null; try { $tcp=New-Object Net.Sockets.TcpClient; $iar=$tcp.BeginConnect('127.0.0.1',5173,$null,$null); $running=$iar.AsyncWaitHandle.WaitOne(250); if($running){$tcp.EndConnect($iar)} } catch { $running=$false } finally { if($tcp){$tcp.Close()} }; if(-not $running){ Start-Process -WindowStyle Minimized -WorkingDirectory '%APPDIR%' -FilePath 'cmd.exe' -ArgumentList '/d','/c','npm.cmd run dev' }"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 60;$i++){ try { $tcp=New-Object Net.Sockets.TcpClient; $iar=$tcp.BeginConnect('127.0.0.1',5173,$null,$null); if($iar.AsyncWaitHandle.WaitOne(300)){ $tcp.EndConnect($iar); $tcp.Close(); $ok=$true; break } $tcp.Close() } catch {}; Start-Sleep -Milliseconds 300 }; if($ok){ Start-Process '%URL%' } else { Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('FTTH Vite did not start on http://127.0.0.1:5173. Check that Node.js and dependencies are installed.','FTTH KMZ to CAD') }"

popd
exit /b 0
