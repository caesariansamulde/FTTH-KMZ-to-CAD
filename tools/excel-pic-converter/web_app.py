#!/usr/bin/env python3
"""
Web-Based Telecom Survey Excel Picture Converter Application
Backend Server using FastAPI and Uvicorn.
Provides REST endpoints, Server-Sent Events (SSE) progress streaming,
file download, and Windows Explorer folder opening.
"""

import os
import sys
import re
import uuid
import json
import time
import shutil
import zipfile
import tempfile
import asyncio
import threading
import subprocess
from typing import Dict, Any, Optional
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.responses import HTMLResponse, FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Import core conversion engine
from convert_to_excel_pic import convert, find_target_files, to_long_path, strip_long_path

app = FastAPI(title="Telecom Survey Excel Picture Converter", version="1.0.0")

# Mount static files (supporting PyInstaller bundle and local directory)
def get_static_path():
    candidates = [
        Path(getattr(sys, "_MEIPASS", "")) / "static",
        Path(__file__).parent / "static",
        Path.cwd() / "static"
    ]
    for p in candidates:
        if p and p.exists() and p.is_dir():
            return p
    return None

static_dir = get_static_path()
if static_dir:
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# CORS middleware for local usage
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global in-memory task registry
TASKS: Dict[str, Dict[str, Any]] = {}
TASK_QUEUES: Dict[str, asyncio.Queue] = {}


def clean_and_normalize_path(raw_path: Optional[str]) -> str:
    """
    Cleans and normalizes user-provided paths:
    - Strips leading/trailing whitespace
    - Removes invisible Windows Unicode formatting marks (\u202a, \u202b, \u202c, \u202d, \u202e, \u200e, \u200f, \ufeff)
    - Strips surrounding standard and smart quotes (", ', “, ”, ‘, ’)
    - Expands ~ (user home) and environment variables (%USERPROFILE%, %TEMP%, etc.)
    - Normalizes path separators
    """
    if not raw_path:
        return ""
    p = raw_path.strip()
    p = re.sub(r'[\u202a\u202b\u202c\u202d\u202e\u200e\u200f\ufeff]', '', p)
    p = p.strip('"\'\u201c\u201d\u2018\u2019')
    p = os.path.expanduser(p)
    p = os.path.expandvars(p)
    try:
        resolved = str(Path(p).resolve())
        return resolved
    except Exception:
        return os.path.normpath(p)


def get_default_browse_dir() -> str:
    """
    Returns the most suitable starting directory for browsing or scanning
    without hardcoding any machine-specific paths.
    """
    checks = [
        Path.home() / "Downloads",
        Path.home() / "Desktop",
        Path.cwd(),
        Path(sys.executable).parent if getattr(sys, 'frozen', False) else Path(__file__).parent,
        Path("D:/KASBEL/OTHERS") if Path("D:/KASBEL/OTHERS").exists() else None,
        Path.home(),
        Path("C:/")
    ]
    for p in checks:
        if p and p.exists() and p.is_dir():
            return str(p.resolve())
    return os.path.abspath(".")


class ConvertPathRequest(BaseModel):
    path: str
    output_folder: Optional[str] = None


class BrowseFolderRequest(BaseModel):
    initial_dir: Optional[str] = None


class BrowseFileRequest(BaseModel):
    initial_dir: Optional[str] = None


class InspectPathRequest(BaseModel):
    path: str


class OpenFolderRequest(BaseModel):
    path: str


def run_conversion_worker(task_id: str, input_dir: str, output_folder: Optional[str], is_temp: bool = False):
    """
    Background worker that runs the conversion engine and pushes updates to the queue.
    """
    task = TASKS[task_id]

    def progress_callback(percent: int, message: str, meta: Optional[Dict[str, Any]] = None):
        task["percent"] = percent
        task["message"] = message
        task["meta"] = meta or {}
        task["last_updated"] = time.time()

    try:
        task["status"] = "running"
        task["message"] = "Starting conversion..."
        task["percent"] = 1

        result = convert(input_dir, output_folder, progress_callback=progress_callback)

        task["status"] = "completed"
        task["percent"] = 100
        task["message"] = "Conversion successfully completed!"
        task["result"] = result
        task["output_file"] = result["output_excel_path"]
        task["output_dir"] = result["output_dir"]

    except Exception as e:
        import traceback
        traceback.print_exc()
        task["status"] = "failed"
        task["message"] = str(e)
        task["error_detail"] = traceback.format_exc()
    finally:
        task["finished"] = True


def get_template_path():
    """Resolves templates/index.html supporting PyInstaller bundle and local directory."""
    candidates = [
        Path(getattr(sys, "_MEIPASS", "")) / "templates" / "index.html",
        Path(__file__).parent / "templates" / "index.html",
        Path.cwd() / "templates" / "index.html"
    ]
    for p in candidates:
        if p and p.exists():
            return p
    return None


@app.get("/", response_class=HTMLResponse)
async def serve_ui():
    """
    Serves the modern frontend dashboard UI.
    """
    tp = get_template_path()
    if tp and tp.exists():
        return HTMLResponse(content=tp.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>Error: templates/index.html not found</h1>", status_code=500)


@app.get("/api/candidates")
async def get_candidate_folders():
    """
    Scans common user directories (Downloads, Desktop, cwd, etc.)
    for candidate survey folders.
    """
    candidates = []
    seen = set()

    scan_roots = [
        Path.cwd(),
        Path.cwd().parent if Path.cwd().parent != Path.cwd() else None,
        Path(sys.executable).parent if getattr(sys, 'frozen', False) else Path(__file__).parent,
        Path.home() / "Downloads",
        Path.home() / "Desktop",
        Path.home() / "Documents",
        Path("D:/KASBEL/OTHERS") if Path("D:/KASBEL/OTHERS").exists() else None,
    ]

    for root in filter(None, scan_roots):
        if not root.exists() or not root.is_dir():
            continue
        try:
            for item in root.iterdir():
                if item in seen:
                    continue
                seen.add(item)

                if item.is_dir():
                    # Check if directly an excel and attachment folder or contains one
                    has_xlsx = any(f.suffix.lower() == '.xlsx' and not f.name.startswith('~$') for f in item.glob('*.xlsx'))
                    has_pic = any(item.joinpath(pn).is_dir() for pn in ('Picture', 'picture', 'Pictures', 'PICTURE', 'photo', 'photos'))
                    if has_xlsx and has_pic:
                        candidates.append({
                            "name": item.name,
                            "path": str(item.resolve()),
                            "parent": str(item.parent.name)
                        })
                    else:
                        # Check immediate subdirectories (1 level down)
                        try:
                            for sub in item.iterdir():
                                if sub.is_dir() and sub not in seen:
                                    seen.add(sub)
                                    sub_has_xlsx = any(f.suffix.lower() == '.xlsx' and not f.name.startswith('~$') for f in sub.glob('*.xlsx'))
                                    sub_has_pic = any(sub.joinpath(pn).is_dir() for pn in ('Picture', 'picture', 'Pictures', 'PICTURE', 'photo', 'photos'))
                                    if sub_has_xlsx and sub_has_pic:
                                        candidates.append({
                                            "name": f"{item.name} / {sub.name}",
                                            "path": str(sub.resolve()),
                                            "parent": str(item.name)
                                        })
                        except Exception:
                            pass
                elif item.is_file() and item.suffix.lower() == '.zip':
                    # Highlight survey ZIP packages
                    lower_name = item.name.lower()
                    if any(kw in lower_name for kw in ('excel', 'hori', 'batch', 'survey', 'tcfg')):
                        candidates.append({
                            "name": f"📦 {item.name}",
                            "path": str(item.resolve()),
                            "parent": str(item.parent.name)
                        })
        except Exception:
            pass

    return JSONResponse({"candidates": candidates[:15]})


@app.post("/api/browse-folder")
async def browse_folder_dialog(req: Optional[BrowseFolderRequest] = None):
    """
    Opens native Windows File Explorer folder picker dialog on the desktop and returns the selected path.
    """
    init_dir = None
    if req and req.initial_dir:
        cand = clean_and_normalize_path(req.initial_dir)
        if os.path.exists(cand):
            init_dir = cand if os.path.isdir(cand) else os.path.dirname(cand)

    if not init_dir or not os.path.exists(init_dir):
        init_dir = get_default_browse_dir()

    def run_dialog():
        # 1. Try modern Tkinter folder dialog first
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            folder = filedialog.askdirectory(
                title="Select Survey Batch Folder (containing .xlsx and Picture/)",
                initialdir=init_dir
            )
            root.destroy()
            if folder:
                return clean_and_normalize_path(folder)
        except Exception as e:
            print(f"Tkinter dialog note: {e}")

        # 2. Fallback to PowerShell FolderBrowserDialog with -STA
        try:
            escaped_init = init_dir.replace("'", "''")
            ps_cmd = f"""
            Add-Type -AssemblyName System.Windows.Forms
            $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
            $dialog.Description = 'Select Survey Batch Folder (containing .xlsx and Picture/)'
            $dialog.ShowNewFolderButton = $true
            if (Test-Path '{escaped_init}') {{ $dialog.SelectedPath = '{escaped_init}' }}
            $form = New-Object System.Windows.Forms.Form
            $form.TopMost = $true
            $form.StartPosition = 'CenterScreen'
            $form.WindowState = 'Minimized'
            $form.Show()
            $form.WindowState = 'Normal'
            $form.BringToFront()
            $res = $dialog.ShowDialog($form)
            $form.Dispose()
            if ($res -eq [System.Windows.Forms.DialogResult]::OK) {{
                Write-Output $dialog.SelectedPath
            }}
            """
            res = subprocess.run(["powershell", "-NoProfile", "-STA", "-Command", ps_cmd], capture_output=True, text=True, timeout=120)
            selected = res.stdout.strip()
            if selected:
                return clean_and_normalize_path(selected)
        except Exception as e:
            print(f"PowerShell dialog note: {e}")

        return ""

    loop = asyncio.get_event_loop()
    selected_path = await loop.run_in_executor(None, run_dialog)
    return {"path": selected_path, "selected": bool(selected_path)}


@app.post("/api/browse-file")
async def browse_file_dialog(req: Optional[BrowseFileRequest] = None):
    """
    Opens native Windows File Explorer file picker dialog to pick a .zip or .xlsx survey package.
    """
    init_dir = None
    if req and req.initial_dir:
        cand = clean_and_normalize_path(req.initial_dir)
        if os.path.exists(to_long_path(cand)):
            init_dir = cand if os.path.isdir(to_long_path(cand)) else os.path.dirname(cand)

    if not init_dir or not os.path.exists(to_long_path(init_dir)):
        init_dir = get_default_browse_dir()

    def run_dialog():
        # 1. Tkinter OpenFileDialog
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes("-topmost", True)
            selected_file = filedialog.askopenfilename(
                title="Select Survey ZIP Package or Excel File",
                initialdir=init_dir,
                filetypes=[
                    ("Survey Packages", "*.zip;*.xlsx"),
                    ("ZIP archives (*.zip)", "*.zip"),
                    ("Excel files (*.xlsx)", "*.xlsx"),
                    ("All files", "*.*")
                ]
            )
            root.destroy()
            if selected_file:
                return clean_and_normalize_path(selected_file)
        except Exception as e:
            print(f"Tkinter file dialog note: {e}")

        # 2. PowerShell OpenFileDialog fallback
        try:
            escaped_init = init_dir.replace("'", "''")
            ps_cmd = f"""
            Add-Type -AssemblyName System.Windows.Forms
            $dialog = New-Object System.Windows.Forms.OpenFileDialog
            $dialog.Title = 'Select Survey ZIP Package or Excel File'
            $dialog.Filter = 'Survey Packages (*.zip;*.xlsx)|*.zip;*.xlsx|ZIP Archives (*.zip)|*.zip|All Files (*.*)|*.*'
            if (Test-Path '{escaped_init}') {{ $dialog.InitialDirectory = '{escaped_init}' }}
            $form = New-Object System.Windows.Forms.Form
            $form.TopMost = $true
            $form.StartPosition = 'CenterScreen'
            $form.WindowState = 'Minimized'
            $form.Show()
            $form.WindowState = 'Normal'
            $form.BringToFront()
            $res = $dialog.ShowDialog($form)
            $form.Dispose()
            if ($res -eq [System.Windows.Forms.DialogResult]::OK) {{
                Write-Output $dialog.FileName
            }}
            """
            res = subprocess.run(["powershell", "-NoProfile", "-STA", "-Command", ps_cmd], capture_output=True, text=True, timeout=120)
            selected = res.stdout.strip()
            if selected:
                return clean_and_normalize_path(selected)
        except Exception as e:
            print(f"PowerShell file dialog note: {e}")

        return ""

    loop = asyncio.get_event_loop()
    selected_path = await loop.run_in_executor(None, run_dialog)
    return {"path": selected_path, "selected": bool(selected_path)}


@app.post("/api/inspect")
async def inspect_package_path(req: InspectPathRequest):
    """
    Validates a selected survey package (folder or .zip) and returns quick preview metadata.
    """
    clean_p = clean_and_normalize_path(req.path)
    if not clean_p:
        return {"valid": False, "error": "Path cannot be empty"}

    target_long = to_long_path(clean_p)
    if not os.path.exists(target_long):
        return {"valid": False, "error": f"Path not found on computer: {clean_p}"}

    is_zip = os.path.isfile(target_long) and clean_p.lower().endswith('.zip')

    if is_zip:
        try:
            with zipfile.ZipFile(target_long, 'r') as z:
                names = z.namelist()
                xlsx_names = [n for n in names if n.lower().endswith('.xlsx') and not os.path.basename(n).startswith('~$')]
                pic_entries = [n for n in names if 'picture/' in n.lower() or 'pictures/' in n.lower()]
                if not xlsx_names:
                    return {"valid": False, "is_zip": True, "error": "No .xlsx survey file found inside the ZIP archive."}
                return {
                    "valid": True,
                    "is_zip": True,
                    "name": Path(clean_p).name,
                    "path": clean_p,
                    "excel_file": Path(xlsx_names[0]).name,
                    "photo_count_est": len(pic_entries)
                }
        except Exception as e:
            return {"valid": False, "is_zip": True, "error": f"Invalid or unreadable ZIP archive: {e}"}

    # Folder inspection
    try:
        excel_p, pic_d, resolved_d = find_target_files(clean_p)
        pole_folders = []
        if os.path.isdir(to_long_path(pic_d)):
            pole_folders = [f for f in os.listdir(to_long_path(pic_d)) if os.path.isdir(to_long_path(os.path.join(pic_d, f)))]
        return {
            "valid": True,
            "is_zip": False,
            "name": Path(resolved_d).name,
            "path": clean_p,
            "resolved_path": strip_long_path(resolved_d),
            "excel_file": Path(excel_p).name,
            "pole_count_est": len(pole_folders)
        }
    except Exception as e:
        return {"valid": False, "is_zip": False, "error": str(e)}


@app.post("/api/convert/path")
async def convert_from_local_path(req: ConvertPathRequest, background_tasks: BackgroundTasks):
    """
    Trigger conversion using a local directory path or .zip file.
    """
    clean_p = clean_and_normalize_path(req.path)
    if not clean_p:
        raise HTTPException(status_code=400, detail="Path cannot be empty. Please enter or select a folder path.")

    target_long = to_long_path(clean_p)
    if not os.path.exists(target_long):
        raise HTTPException(
            status_code=400,
            detail=f"The specified path does not exist on this computer:\n'{clean_p}'\nPlease check the path or click 'Browse Folder' to choose your survey directory."
        )

    # If user provided a .zip file directly, automatically extract it
    if os.path.isfile(target_long) and clean_p.lower().endswith('.zip'):
        target_path = Path(clean_p)
        extract_parent = target_path.parent / f"{target_path.stem}_extracted"
        os.makedirs(to_long_path(str(extract_parent)), exist_ok=True)
        with zipfile.ZipFile(target_long, 'r') as z:
            z.extractall(to_long_path(str(extract_parent)))
        clean_p = str(extract_parent)

    # Find the actual survey package folder using recursive detection
    try:
        _, _, resolved_batch_dir = find_target_files(clean_p)
        target_path_str = strip_long_path(resolved_batch_dir)
    except FileNotFoundError as fnf_err:
        raise HTTPException(status_code=400, detail=str(fnf_err))

    clean_out = clean_and_normalize_path(req.output_folder) if req.output_folder else None

    task_id = uuid.uuid4().hex[:10]
    TASKS[task_id] = {
        "id": task_id,
        "input_path": target_path_str,
        "status": "pending",
        "percent": 0,
        "message": "Queued for conversion...",
        "created_at": time.time(),
        "finished": False,
        "result": None,
        "error_detail": None,
        "is_temp": False
    }

    # Run in thread
    t = threading.Thread(
        target=run_conversion_worker,
        args=(task_id, target_path_str, clean_out, False),
        daemon=True
    )
    t.start()

    return {"task_id": task_id, "status": "started", "target_folder": target_path_str}


@app.post("/api/convert/upload")
async def convert_from_upload(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """
    Trigger conversion by uploading a ZIP archive of the batch package.
    Places the resulting excelPic folder in the user's Downloads directory
    or alongside the application for easy access.
    """
    if not file.filename.lower().endswith('.zip'):
        raise HTTPException(status_code=400, detail="Only .zip archives are supported for upload.")

    temp_dir = tempfile.mkdtemp(prefix="excelpic_upload_")
    zip_path = os.path.join(temp_dir, file.filename)

    # Save uploaded file
    with open(zip_path, "wb") as f_out:
        shutil.copyfileobj(file.file, f_out)

    # Extract ZIP
    extract_dir = os.path.join(temp_dir, "extracted")
    os.makedirs(extract_dir, exist_ok=True)
    with zipfile.ZipFile(zip_path, 'r') as z:
        z.extractall(extract_dir)

    try:
        _, _, batch_dir = find_target_files(extract_dir)
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Determine user-friendly output directory in Downloads
    user_downloads = Path.home() / "Downloads"
    if not user_downloads.exists():
        user_downloads = Path.cwd()

    zip_stem = Path(file.filename).stem
    out_dir_name = zip_stem.replace('excel(excel and attachment)', 'excel(excelPic)') if 'excel(excel and attachment)' in zip_stem else f"{zip_stem}_excelPic"
    final_output_dir = str(user_downloads / out_dir_name)

    task_id = uuid.uuid4().hex[:10]
    TASKS[task_id] = {
        "id": task_id,
        "input_path": batch_dir,
        "temp_root": temp_dir,
        "status": "pending",
        "percent": 0,
        "message": "Upload extracted. Queued for conversion...",
        "created_at": time.time(),
        "finished": False,
        "result": None,
        "error_detail": None,
        "is_temp": True
    }

    t = threading.Thread(
        target=run_conversion_worker,
        args=(task_id, batch_dir, final_output_dir, True),
        daemon=True
    )
    t.start()

    return {"task_id": task_id, "status": "started", "filename": file.filename}


@app.get("/api/progress/{task_id}")
async def get_task_progress(task_id: str):
    """
    Server-Sent Events (SSE) endpoint for live progress streaming.
    """
    if task_id not in TASKS:
        raise HTTPException(status_code=404, detail="Task not found")

    async def event_generator():
        last_pct = -1
        last_msg = ""
        while True:
            task = TASKS.get(task_id)
            if not task:
                break

            current_pct = task.get("percent", 0)
            current_msg = task.get("message", "")
            status = task.get("status", "running")

            # Yield event on change or completion
            payload = {
                "task_id": task_id,
                "status": status,
                "percent": current_pct,
                "message": current_msg,
                "meta": task.get("meta", {}),
                "result": task.get("result", None),
                "error": task.get("error_detail", None)
            }
            yield f"data: {json.dumps(payload)}\n\n"

            if task.get("finished", False):
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@app.get("/api/download/{task_id}")
async def download_converted_file(task_id: str):
    """
    Download the generated Excel file.
    """
    if task_id not in TASKS:
        raise HTTPException(status_code=404, detail="Task not found")

    task = TASKS[task_id]
    if not task.get("finished") or task.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Task has not finished successfully yet.")

    out_file = task.get("output_file")
    if not out_file or not os.path.exists(to_long_path(out_file)):
        raise HTTPException(status_code=404, detail="Output file not found on server.")

    filename = os.path.basename(out_file)
    return FileResponse(
        to_long_path(out_file),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename
    )


@app.post("/api/open-folder")
async def open_output_folder(req: OpenFolderRequest):
    """
    Opens the target output directory or file in Windows File Explorer.
    """
    raw_path = req.path.strip()
    target = clean_and_normalize_path(raw_path)

    if not target:
        raise HTTPException(status_code=400, detail="Path cannot be empty.")

    target_long = to_long_path(target)
    is_file = os.path.isfile(target_long)
    target_dir = os.path.dirname(target) if is_file else target
    target_dir_long = to_long_path(target_dir)

    # If the directory doesn't exist, create it or fallback to parent
    if not os.path.exists(target_dir_long):
        try:
            os.makedirs(target_dir_long, exist_ok=True)
        except Exception:
            parent = os.path.dirname(target_dir)
            if os.path.exists(to_long_path(parent)):
                target_dir = parent

    try:
        if sys.platform == "win32":
            clean_display_target = strip_long_path(target)
            clean_display_dir = strip_long_path(target_dir)
            if is_file and os.path.exists(target_long):
                subprocess.Popen(f'explorer /select,"{clean_display_target}"')
            else:
                os.startfile(clean_display_dir)
        else:
            subprocess.run(["xdg-open", target_dir])
        return {"status": "ok", "opened": strip_long_path(target_dir)}
    except Exception as e:
        return {"status": "warning", "message": f"Could not launch File Explorer automatically: {e}"}


if __name__ == "__main__":
    import uvicorn
    import webbrowser

    def open_browser():
        time.sleep(1.2)
        try:
            webbrowser.open("http://127.0.0.1:8000")
        except Exception:
            pass

    threading.Thread(target=open_browser, daemon=True).start()

    print("=" * 70)
    print(" Telecom Survey Excel Picture Converter - Web Server")
    print(" Serving on http://127.0.0.1:8000")
    print(" Opening your default web browser automatically...")
    print("=" * 70)
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
