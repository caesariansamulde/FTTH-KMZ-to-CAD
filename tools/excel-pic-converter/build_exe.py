import os
import sys
import shutil
import PyInstaller.__main__

print("Starting PyInstaller build for Telecom Survey Picture Converter...")

args = [
    'web_app.py',
    '--name=TelecomSurveyPictureConverter',
    '--onefile',
    '--clean',
    '--add-data=templates;templates',
    '--add-data=static;static',
    '--hidden-import=uvicorn.logging',
    '--hidden-import=uvicorn.loops',
    '--hidden-import=uvicorn.loops.auto',
    '--hidden-import=uvicorn.protocols',
    '--hidden-import=uvicorn.protocols.http',
    '--hidden-import=uvicorn.protocols.http.auto',
    '--hidden-import=uvicorn.protocols.http.h11_impl',
    '--hidden-import=uvicorn.protocols.http.httptools_impl',
    '--hidden-import=uvicorn.protocols.websockets',
    '--hidden-import=uvicorn.protocols.websockets.auto',
    '--hidden-import=uvicorn.lifespan',
    '--hidden-import=uvicorn.lifespan.on',
    '--hidden-import=tkinter',
    '--hidden-import=tkinter.filedialog',
    '--hidden-import=convert_to_excel_pic',
    '--collect-all=uvicorn',
    '--collect-all=fastapi',
    '--collect-all=openpyxl',
    '--collect-all=tkinter',
    '--manifest=app.manifest',
]

PyInstaller.__main__.run(args)

dist_exe = os.path.join("dist", "TelecomSurveyPictureConverter.exe")
if os.path.exists(dist_exe):
    print(f"\nBuilt executable successfully: {dist_exe} ({os.path.getsize(dist_exe) / (1024*1024):.1f} MB)")
    
    # Copy to current workspace root
    local_target = os.path.join(".", "TelecomSurveyPictureConverter.exe")
    shutil.copy2(dist_exe, local_target)
    print(f"Copied to: {os.path.abspath(local_target)}")
    
    # Copy to MIN135 folder if it exists
    min135_dir = r"D:\KASBEL\OTHERS\MIN135_HORI_BATCH2"
    if os.path.exists(min135_dir):
        min135_target = os.path.join(min135_dir, "TelecomSurveyPictureConverter.exe")
        shutil.copy2(dist_exe, min135_target)
        print(f"Copied to: {min135_target}")

print("Build and distribution complete!")
