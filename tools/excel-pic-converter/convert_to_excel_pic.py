#!/usr/bin/env python3
"""
Telecom Survey Excel Picture Embedder / File Converter
Converts "excel(excel and attachment)" packages into "excel(excelPic)" files
by embedding the physical JPEG images directly into the worksheet cells.
Matches Apache POI OpenXML output format.
"""

import os
import sys
import re
import io
import time
import zipfile
import argparse
import openpyxl

# Mapping of Photo categories to their 0-indexed column numbers in Sheet 2 (Pole)
# Excel columns: Y=24, Z=25, AA=26, AB=27, AC=28 (0-based)
CATEGORY_COLS = {
    'Photo': 24,
    'Pole tag photo': 25,
    'Pole top photo': 26,
    'Pole bottom photo': 27,
    'Element photo': 28
}

CATEGORY_ORDER = ['Photo', 'Pole tag photo', 'Pole top photo', 'Pole bottom photo', 'Element photo']


def to_long_path(p):
    r"""
    Converts path to Windows extended-length path (\\?\) on Windows,
    supporting paths up to 32,767 characters and bypassing MAX_PATH (260 char) limitation.
    """
    if sys.platform != "win32" or not p:
        return p
    p_str = str(p).strip()
    if p_str.startswith("\\\\?\\"):
        return p_str.replace("/", "\\")
    abs_p = os.path.abspath(p_str).replace("/", "\\")
    if abs_p.startswith("\\\\"):
        # UNC path \\server\share -> \\?\UNC\server\share
        return "\\\\?\\UNC\\" + abs_p[2:]
    return "\\\\?\\" + abs_p


def strip_long_path(p):
    r"""
    Removes \\?\ prefix for clean display in UI, Windows Explorer, or logs.
    """
    if not p:
        return p
    s = str(p)
    if s.startswith("\\\\?\\UNC\\"):
        return "\\\\" + s[8:]
    if s.startswith("\\\\?\\"):
        return s[4:]
    return s


def compute_image_layout(count):
    """
    Computes (colOff, rowOff, cx, cy) in EMUs for images in a cell.
    Matches the exact layout parameters of the Apache POI excelPic export.
    """
    if count == 1:
        return [{'colOff': 1000000, 'rowOff': 0, 'cx': 2162425, 'cy': 1605000}]
    elif count == 2:
        return [
            {'colOff': 500000, 'rowOff': 0, 'cx': 662425, 'cy': 1605000},
            {'colOff': 3000000, 'rowOff': 0, 'cx': 662425, 'cy': 1605000}
        ]
    elif count == 3:
        return [
            {'colOff': 1500000, 'rowOff': 0, 'cx': 1162425, 'cy': 805000},
            {'colOff': 500000, 'rowOff': 900000, 'cx': 1162425, 'cy': 705000},
            {'colOff': 2500000, 'rowOff': 900000, 'cx': 1162425, 'cy': 705000}
        ]
    elif count == 4:
        return [
            {'colOff': 500000, 'rowOff': 0, 'cx': 1162425, 'cy': 750000},
            {'colOff': 2500000, 'rowOff': 0, 'cx': 1162425, 'cy': 750000},
            {'colOff': 500000, 'rowOff': 850000, 'cx': 1162425, 'cy': 750000},
            {'colOff': 2500000, 'rowOff': 850000, 'cx': 1162425, 'cy': 750000}
        ]
    else:
        ncols = (count + 1) // 2
        col_width_emu = 4000000 // ncols
        cx = int(col_width_emu * 0.85)
        cy = 750000
        layouts = []
        for i in range(count):
            r_idx = i // ncols
            c_idx = i % ncols
            c_off = 300000 + c_idx * col_width_emu
            r_off = 0 if r_idx == 0 else 850000
            layouts.append({'colOff': c_off, 'rowOff': r_off, 'cx': cx, 'cy': cy})
        return layouts


def _detect_batch_in_dir(d):
    """
    Checks if directory d directly contains a survey Excel (.xlsx) file
    and a Picture folder (case-insensitive).
    Returns (excel_path, pic_dir) or (None, None).
    """
    d_long = to_long_path(d)
    if not os.path.isdir(d_long):
        return None, None
    try:
        entries = os.listdir(d_long)
    except Exception:
        return None, None

    xlsx_files = [
        os.path.join(d, f) for f in entries
        if f.lower().endswith('.xlsx') and not f.startswith('~$')
    ]
    if not xlsx_files:
        return None, None

    pic_dir = None
    for entry in entries:
        full_p = os.path.join(d, entry)
        if os.path.isdir(to_long_path(full_p)) and entry.lower() in ('picture', 'pictures', 'photo', 'photos'):
            pic_dir = full_p
            break

    if pic_dir:
        return xlsx_files[0], pic_dir
    return None, None


def find_target_files(input_dir):
    """
    Finds the primary .xlsx file and Picture directory in the input folder.
    Supports:
    1. Direct match in input_dir
    2. Case-insensitive picture directory search ('picture', 'pictures', 'photo', 'photos')
    3. Recursive subfolder discovery up to 3 levels deep if input_dir is a parent folder
    Returns: (excel_path, pic_dir, resolved_batch_dir)
    """
    input_dir = os.path.abspath(input_dir)
    if not os.path.exists(to_long_path(input_dir)):
        raise FileNotFoundError(f"Input path does not exist: {strip_long_path(input_dir)}")

    # 1. Direct check
    excel_path, pic_dir = _detect_batch_in_dir(input_dir)
    if excel_path and pic_dir:
        return excel_path, pic_dir, input_dir

    # 2. Recursive search up to 3 levels deep
    candidates = []
    for root, dirs, _ in os.walk(to_long_path(input_dir)):
        clean_root = strip_long_path(root)
        depth = os.path.relpath(clean_root, input_dir).count(os.sep)
        if depth > 3:
            dirs.clear()  # Don't descend deeper than 3 levels
            continue
        ep, pd = _detect_batch_in_dir(clean_root)
        if ep and pd:
            candidates.append((ep, pd, clean_root))

    if candidates:
        # Prefer folders containing 'excel(excel and attachment)' or shortest path
        candidates.sort(key=lambda c: (0 if 'excel(excel and attachment)' in c[2].lower() else 1, len(c[2])))
        best_excel, best_pic, best_dir = candidates[0]
        return best_excel, best_pic, best_dir

    # 3. If not found, provide specific error diagnostics
    any_xlsx = []
    any_pic = []
    for root, dirs, files in os.walk(to_long_path(input_dir)):
        clean_root = strip_long_path(root)
        depth = os.path.relpath(clean_root, input_dir).count(os.sep)
        if depth > 3:
            dirs.clear()
            continue
        for f in files:
            if f.lower().endswith('.xlsx') and not f.startswith('~$'):
                any_xlsx.append(os.path.join(clean_root, f))
        for d in dirs:
            if d.lower() in ('picture', 'pictures', 'photo', 'photos'):
                any_pic.append(os.path.join(clean_root, d))

    if any_xlsx and not any_pic:
        raise FileNotFoundError(
            f"Found Excel file(s) ({os.path.basename(any_xlsx[0])}) in '{strip_long_path(input_dir)}', but no 'Picture' folder was found."
        )
    elif any_pic and not any_xlsx:
        raise FileNotFoundError(
            f"Found 'Picture' folder ({strip_long_path(any_pic[0])}), but no survey Excel (.xlsx) file was found in '{strip_long_path(input_dir)}'."
        )
    else:
        raise FileNotFoundError(
            f"Neither an Excel (.xlsx) file nor a 'Picture' directory was found in '{strip_long_path(input_dir)}' (searched up to 3 levels deep)."
        )


def convert(input_folder, output_folder=None, progress_callback=None):
    start_time = time.time()
    input_folder = os.path.abspath(input_folder)
    print(f"[1/6] Scanning input package: {input_folder}")
    if progress_callback:
        progress_callback(5, "Scanning input package and locating Excel/Picture folder...", {"stage": 1})

    excel_path, pic_dir, resolved_dir = find_target_files(input_folder)
    print(f"      Excel file: {os.path.basename(excel_path)}")
    print(f"      Picture directory: {pic_dir}")
    print(f"      Resolved batch directory: {resolved_dir}")

    # Determine output folder and output file path
    folder_name = os.path.basename(resolved_dir)
    if output_folder:
        out_dir = os.path.abspath(output_folder)
    else:
        if 'excel(excel and attachment)' in folder_name:
            out_name = folder_name.replace('excel(excel and attachment)', 'excel(excelPic)')
        else:
            out_name = folder_name + '_excelPic'
        out_dir = os.path.join(os.path.dirname(resolved_dir), out_name)

    os.makedirs(to_long_path(out_dir), exist_ok=True)
    excel_base = os.path.basename(excel_path)
    if 'excel(excel and attachment)' in excel_base:
        out_excel_base = excel_base.replace('excel(excel and attachment)', 'excel(excelPic)')
    else:
        out_excel_base = os.path.splitext(excel_base)[0] + '_excelPic.xlsx'
    output_excel_path = os.path.join(out_dir, out_excel_base)

    print(f"[2/6] Reading pole records from Excel...")
    if progress_callback:
        progress_callback(12, "Reading pole records from Excel and mapping photo directories...", {"stage": 2})
    wb = openpyxl.load_workbook(to_long_path(excel_path), data_only=False)
    pole_ws = wb['Pole']

    pic_folders = set(os.listdir(to_long_path(pic_dir)))
    pic_folders_list = sorted(list(pic_folders))

    cell_images = {}
    matched_poles = 0
    total_poles = max(0, pole_ws.max_row - 6)
    missing_poles = []

    for r_1idx in range(7, pole_ws.max_row + 1):
        r_0idx = r_1idx - 1
        pid = str(pole_ws.cell(r_1idx, 4).value or '').strip()
        pname = str(pole_ws.cell(r_1idx, 6).value or '').strip()

        # Check cell formula for exact folder name first
        formula_val = str(pole_ws.cell(r_1idx, 25).value or '')
        m_formula = re.search(r'Picture/([^/]+)/Photo/', formula_val)
        folder_match = None

        if m_formula and m_formula.group(1) in pic_folders:
            folder_match = m_formula.group(1)
        else:
            # Match by prefix rule f"{pid}_{pname}_"
            prefix = f"{pid}_{pname}_"
            candidates = [d for d in pic_folders_list if d.startswith(prefix)]
            if candidates:
                folder_match = candidates[0]

        if not folder_match:
            missing_poles.append((r_1idx, pid, pname))
            continue

        matched_poles += 1
        for cat in CATEGORY_ORDER:
            col_0idx = CATEGORY_COLS[cat]
            cat_p = os.path.join(pic_dir, folder_match, cat)
            cat_p_long = to_long_path(cat_p)
            if os.path.exists(cat_p_long) and os.path.isdir(cat_p_long):
                imgs = [
                    os.path.join(cat_p, f) for f in sorted(os.listdir(cat_p_long))
                    if f.lower().endswith(('.jpg', '.jpeg', '.png')) and os.path.isfile(to_long_path(os.path.join(cat_p, f))) and os.path.getsize(to_long_path(os.path.join(cat_p, f))) > 0
                ]
                if imgs:
                    cell_images[(r_0idx, col_0idx)] = imgs

    wb.close()
    print(f"      Matched {matched_poles} poles with photo folders.")
    if missing_poles:
        print(f"      Poles with no photos: {len(missing_poles)} (e.g. {missing_poles[0]})")

    # Collect all image files to embed
    total_images = sum(len(v) for v in cell_images.values())
    print(f"[3/6] Total images to embed: {total_images} across {len(cell_images)} cells")

    # Read the original xlsx package
    print(f"[4/6] Processing OpenXML sheets and generating drawingml...")
    with zipfile.ZipFile(to_long_path(excel_path), 'r') as zin:
        sheet2_xml = zin.read('xl/worksheets/sheet2.xml').decode('utf-8')
        content_types_xml = zin.read('[Content_Types].xml').decode('utf-8')
        
        other_entries = {}
        for item in zin.infolist():
            if item.filename not in ['xl/worksheets/sheet2.xml', '[Content_Types].xml']:
                other_entries[item.filename] = zin.read(item.filename)

    # 1. Update sheet2.xml:
    # Ensure xmlns:r namespace is declared on worksheet tag
    if 'xmlns:r=' not in sheet2_xml:
        sheet2_xml = sheet2_xml.replace(
            '<worksheet ',
            '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        )
    cols_pattern = r'<cols>.*?</cols>'
    m_cols = re.search(cols_pattern, sheet2_xml, re.DOTALL)
    if m_cols:
        cols_xml = m_cols.group(0)
        for c_idx in range(25, 30):
            col_tag_pat = rf'<col min="{c_idx}" max="{c_idx}"[^>]*/>'
            new_col_tag = f'<col min="{c_idx}" max="{c_idx}" width="62.5" customWidth="true"/>'
            if re.search(col_tag_pat, cols_xml):
                cols_xml = re.sub(col_tag_pat, new_col_tag, cols_xml)
            else:
                cols_xml = cols_xml.replace('</cols>', f'{new_col_tag}</cols>')
        sheet2_xml = sheet2_xml[:m_cols.start()] + cols_xml + sheet2_xml[m_cols.end():]

    # Set row heights for rows >= 7 to 150.0
    def update_row_tag(match):
        tag = match.group(0)
        r_num = int(re.search(r'r="(\d+)"', tag).group(1))
        if r_num >= 7:
            tag = re.sub(r'\s+ht="[^"]*"', '', tag)
            tag = re.sub(r'\s+customHeight="[^"]*"', '', tag)
            tag = tag.rstrip('>') + ' customHeight="1" ht="150.0">'
        return tag

    sheet2_xml = re.sub(r'<row r="\d+"[^>]*>', update_row_tag, sheet2_xml)

    # Clear cell contents in columns Y, Z, AA, AB, AC (keep style, ONLY for data rows >= 7)
    def clean_cell(match):
        c_tag = match.group(0)
        m_r = re.search(r'r="([A-Z]+)(\d+)"', c_tag)
        m_s = re.search(r's="(\d+)"', c_tag)
        if m_r:
            col_letters = m_r.group(1)
            row_num = int(m_r.group(2))
            # ONLY clear cells for data rows (row_num >= 7), preserving header titles in rows 1..6
            if col_letters in ['Y', 'Z', 'AA', 'AB', 'AC'] and row_num >= 7:
                s_attr = f' s="{m_s.group(1)}"' if m_s else ''
                return f'<c r="{col_letters}{row_num}"{s_attr}></c>'
        return c_tag

    sheet2_xml = re.sub(r'<c r="(?:Y|Z|AA|AB|AC)\d+"[^>]*>.*?</c>|<c r="(?:Y|Z|AA|AB|AC)\d+"[^>]*/>', clean_cell, sheet2_xml, flags=re.DOTALL)

    # Add <drawing r:id="rId1"/> right after <pageMargins.../>
    if '<drawing r:id="rId1"/>' not in sheet2_xml:
        m_pm = re.search(r'<pageMargins[^>]*/>', sheet2_xml)
        if m_pm:
            insert_pos = m_pm.end()
            sheet2_xml = sheet2_xml[:insert_pos] + '<drawing r:id="rId1"/>' + sheet2_xml[insert_pos:]
        else:
            sheet2_xml = sheet2_xml.replace('</worksheet>', '<drawing r:id="rId1"/></worksheet>')

    # 2. Build drawing1.xml and drawing1.xml.rels
    drawing_xml_parts = [
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" '
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    ]
    rels_xml_parts = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    ]

    image_counter = 0
    image_paths_to_write = []

    sorted_cells = sorted(cell_images.keys())
    for (r_0idx, col_0idx) in sorted_cells:
        imgs = cell_images[(r_0idx, col_0idx)]
        layouts = compute_image_layout(len(imgs))
        for img_idx, img_path in enumerate(imgs):
            image_counter += 1
            r_id = f"rId{image_counter}"
            img_rel_path = f"../media/image{image_counter}.jpeg"
            image_paths_to_write.append((image_counter, img_path))

            rels_xml_parts.append(
                f'<Relationship Id="{r_id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" '
                f'Target="{img_rel_path}"/>'
            )

            lay = layouts[img_idx]
            colOff = lay['colOff']
            rowOff = lay['rowOff']
            cx = lay['cx']
            cy = lay['cy']
            to_colOff = colOff + cx
            to_rowOff = rowOff + cy

            anchor_xml = (
                f'<xdr:twoCellAnchor editAs="oneCell">'
                f'<xdr:from><xdr:col>{col_0idx}</xdr:col><xdr:colOff>{colOff}</xdr:colOff><xdr:row>{r_0idx}</xdr:row><xdr:rowOff>{rowOff}</xdr:rowOff></xdr:from>'
                f'<xdr:to><xdr:col>{col_0idx}</xdr:col><xdr:colOff>{to_colOff}</xdr:colOff><xdr:row>{r_0idx}</xdr:row><xdr:rowOff>{to_rowOff}</xdr:rowOff></xdr:to>'
                f'<xdr:pic>'
                f'<xdr:nvPicPr><xdr:cNvPr id="{image_counter}" name="Picture {image_counter}" descr="Picture"/><xdr:cNvPicPr><a:picLocks noChangeAspect="true"/></xdr:cNvPicPr></xdr:nvPicPr>'
                f'<xdr:blipFill><a:blip r:embed="{r_id}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'
                f'<xdr:spPr><a:xfrm><a:off x="{colOff}" y="{rowOff}"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>'
                f'</xdr:pic>'
                f'<xdr:clientData/>'
                f'</xdr:twoCellAnchor>'
            )
            drawing_xml_parts.append(anchor_xml)

    drawing_xml_parts.append('</xdr:wsDr>')
    rels_xml_parts.append('</Relationships>')

    drawing1_xml_content = ''.join(drawing_xml_parts).encode('utf-8')
    drawing1_rels_content = ''.join(rels_xml_parts).encode('utf-8')

    # 3. Create xl/worksheets/_rels/sheet2.xml.rels
    sheet2_rels_content = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Target="../drawings/drawing1.xml" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing"/>'
        '</Relationships>'
    ).encode('utf-8')

    # 4. Update [Content_Types].xml
    if 'Extension="jpeg"' not in content_types_xml:
        m_types = re.search(r'<Types[^>]*>', content_types_xml)
        if m_types:
            content_types_xml = (
                content_types_xml[:m_types.end()] +
                '<Default ContentType="image/jpeg" Extension="jpeg"/>' +
                content_types_xml[m_types.end():]
            )
    if 'drawing1.xml' not in content_types_xml:
        content_types_xml = content_types_xml.replace(
            '</Types>',
            '<Override ContentType="application/vnd.openxmlformats-officedocument.drawing+xml" '
            'PartName="/xl/drawings/drawing1.xml"/></Types>'
        )

    # 5. Stream into new ZIP archive
    print(f"[5/6] Writing output package: {os.path.basename(output_excel_path)} ...")
    with zipfile.ZipFile(to_long_path(output_excel_path), 'w', compression=zipfile.ZIP_DEFLATED) as zout:
        zout.writestr('xl/worksheets/sheet2.xml', sheet2_xml.encode('utf-8'))
        zout.writestr('[Content_Types].xml', content_types_xml.encode('utf-8'))
        zout.writestr('xl/drawings/drawing1.xml', drawing1_xml_content)
        zout.writestr('xl/drawings/_rels/drawing1.xml.rels', drawing1_rels_content)
        zout.writestr('xl/worksheets/_rels/sheet2.xml.rels', sheet2_rels_content)

        for fname, data in other_entries.items():
            zout.writestr(fname, data)

        last_pct = -1
        last_callback_time = 0
        for idx, (img_num, src_path) in enumerate(image_paths_to_write, 1):
            with open(to_long_path(src_path), 'rb') as f_img:
                zout.writestr(f'xl/media/image{img_num}.jpeg', f_img.read())
            pct = int(idx * 100 / total_images)
            now = time.time()
            if pct % 5 == 0 and pct != last_pct and (now - last_callback_time > 0.3 or pct == 100):
                print(f"      Embedding images: {pct}% ({idx}/{total_images})")
                last_pct = pct
                last_callback_time = now
                if progress_callback:
                    scaled_pct = 30 + int(idx * 65 / total_images)
                    progress_callback(
                        scaled_pct,
                        f"Embedding images into cells... {idx}/{total_images} ({pct}%)",
                        {"current_image": idx, "total_images": total_images, "stage": 5}
                    )

    elapsed = time.time() - start_time
    out_size_mb = os.path.getsize(to_long_path(output_excel_path)) / (1024 * 1024)
    print(f"[6/6] Done in {elapsed:.1f}s!")
    print(f"      Successfully generated: {strip_long_path(output_excel_path)}")
    print(f"      File size: {out_size_mb:.2f} MB")
    
    result_data = {
        "output_excel_path": strip_long_path(output_excel_path),
        "output_dir": strip_long_path(out_dir),
        "filename": os.path.basename(output_excel_path),
        "total_poles": total_poles if 'total_poles' in locals() else matched_poles,
        "matched_poles": matched_poles,
        "missing_poles": [f"Row {m[0]}: {m[1]} ({m[2]})" for m in missing_poles],
        "total_images": total_images,
        "total_cells": len(cell_images),
        "file_size_mb": round(out_size_mb, 2),
        "elapsed_seconds": round(elapsed, 1)
    }

    if progress_callback:
        progress_callback(100, "Conversion complete! Excel file ready.", result_data)

    return result_data


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Convert Telecom Survey Excel package with Picture folder into Excel with embedded pictures.")
    parser.add_argument("input_folder", nargs="?", default=".", help="Path to input directory containing .xlsx and Picture/ folder.")
    parser.add_argument("-o", "--output_folder", help="Optional path to output folder.")
    args = parser.parse_args()

    target = args.input_folder
    if target == ".":
        subdirs = [
            d for d in os.listdir(".")
            if os.path.isdir(d) and 'excel(excel and attachment)' in d
        ]
        if subdirs:
            target = subdirs[0]

    try:
        convert(target, args.output_folder)
    except Exception as e:
        print(f"\n[ERROR]: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
