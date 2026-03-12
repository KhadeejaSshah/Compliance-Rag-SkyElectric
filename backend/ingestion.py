from pypdf import PdfReader
from io import BytesIO
from typing import List, Dict
import re
import csv
import math
import io
from .models import store
from .rag import rag_engine

# Try to import python-docx
try:
    from docx import Document as DocxDocument
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False


def parse_xlsx(file_content: bytes, filename: str) -> List[Dict]:
    """Parse XLSX and extract clauses. Each row is treated as a context block."""
    if not XLSX_AVAILABLE:
        raise ImportError("openpyxl is not installed. Run: pip install openpyxl")
    
    wb = openpyxl.load_workbook(BytesIO(file_content), data_only=True)
    clauses = []
    
    for sheet_name in wb.sheetnames:
        sheet = wb[sheet_name]
        for row_idx, row in enumerate(sheet.iter_rows(values_only=True)):
            if not row:
                continue
            
            # Combine row values into a single string
            row_text = " | ".join([str(cell) for cell in row if cell is not None]).strip()
            
            if len(row_text) > 20:
                clauses.append({
                    "clause_id": f"{sheet_name}-R{row_idx+1}",
                    "text": row_text,
                    "page_number": 1,
                    "severity": "MUST" if any(word in row_text.lower() for word in ["shall", "must", "required"]) else "SHOULD"
                })
    
    return clauses


def parse_pdf(file_content: bytes, filename: str) -> List[Dict]:
    """Parse PDF and extract clauses."""
    reader = PdfReader(BytesIO(file_content))
    clauses = []
    
    # regex for clause-like patterns
    pattern = r'(?m)^(\d+\.[\d\.]+|[A-Z]\.[\d\.]+|Article\s+\d+:?)\s+(.*)'
    
    for page_num, page in enumerate(reader.pages):
        page_text = page.extract_text()
        if not page_text:
            continue
        
        matches = list(re.finditer(pattern, page_text))
        
        if not matches:
            # Fallback: split by double newlines on this page
            paragraphs = page_text.split("\n\n")
            for i, p in enumerate(paragraphs):
                if len(p.strip()) > 20:
                    clauses.append({
                        "clause_id": f"P-{page_num}-{i}",
                        "text": p.strip(),
                        "page_number": page_num + 1,
                        "severity": "UNKNOWN"
                    })
        else:
            for i in range(len(matches)):
                start = matches[i].start()
                end = matches[i+1].start() if i + 1 < len(matches) else len(page_text)
                clause_id = matches[i].group(1).strip()
                text = page_text[start:end].strip()
                clauses.append({
                    "clause_id": clause_id,
                    "text": text,
                    "page_number": page_num + 1,
                    "severity": "MUST" if "shall" in text.lower() or "must" in text.lower() else "SHOULD"
                })
    
    return clauses


def parse_docx(file_content: bytes, filename: str) -> List[Dict]:
    """Parse DOCX and extract clauses."""
    if not DOCX_AVAILABLE:
        raise ImportError("python-docx is not installed. Run: pip install python-docx")
    
    doc = DocxDocument(BytesIO(file_content))
    clauses = []
    
    # regex for clause-like patterns
    pattern = r'^(\d+\.[\d\.]+|[A-Z]\.[\d\.]+|Article\s+\d+:?)\s+'
    
    current_text = []
    current_clause_id = None
    paragraph_counter = 0
    
    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        
        match = re.match(pattern, text)
        
        if match:
            # Save previous clause if exists
            if current_clause_id and current_text:
                full_text = "\n".join(current_text)
                clauses.append({
                    "clause_id": current_clause_id,
                    "text": full_text,
                    "page_number": 1,  # DOCX doesn't have reliable page numbers
                    "severity": "MUST" if "shall" in full_text.lower() or "must" in full_text.lower() else "SHOULD"
                })
            
            current_clause_id = match.group(1).strip()
            current_text = [text]
        elif current_clause_id:
            current_text.append(text)
        else:
            # No clause structure found, treat as paragraph
            if len(text) > 20:
                clauses.append({
                    "clause_id": f"Para-{paragraph_counter}",
                    "text": text,
                    "page_number": 1,
                    "severity": "UNKNOWN"
                })
                paragraph_counter += 1
    
    # Save last clause
    if current_clause_id and current_text:
        full_text = "\n".join(current_text)
        clauses.append({
            "clause_id": current_clause_id,
            "text": full_text,
            "page_number": 1,
            "severity": "MUST" if "shall" in full_text.lower() or "must" in full_text.lower() else "SHOULD"
        })
    
    return clauses


def parse_csv(file_content: bytes, filename: str) -> List[Dict]:
    """Router for CSV parsing. Detects if it's a Yokogawa instrument CSV or generic."""
    print(f"DEBUG: Entering parse_csv for filename: {filename}")
    text = file_content.decode('utf-8', errors='replace')
    lines = text.splitlines()
    
    # Simple detection: Look for Yokogawa-specific header keys in the first few lines
    is_yokogawa = False
    print(f"DEBUG: Detecting CSV type. Checking first 5 lines of {filename}")
    for i, line in enumerate(lines[:5]):
        print(f"DEBUG: Line {i}: {line[:100]}")
        if any(key in line for key in ['"Header Size"', '"Model Name"', '"TraceName"', 'Header Size', 'Model Name']):
            is_yokogawa = True
            break
            
    if is_yokogawa:
        print(f"DEBUG: {filename} detected as YOKOGAWA format")
        return parse_yokogawa_csv(file_content, filename)
    else:
        print(f"DEBUG: {filename} detected as GENERIC format")
        return parse_csv_generic(file_content, filename)


def parse_csv_generic(file_content: bytes, filename: str) -> List[Dict]:
    """Parse a standard tabular CSV and extract each row as a clause."""
    text = file_content.decode('utf-8', errors='replace')
    f = io.StringIO(text)
    reader = csv.reader(f)
    
    clauses = []
    rows = list(reader)
    if not rows:
        return []
        
    # Assume first row is header
    headers = [h.strip() for h in rows[0]]
    
    for row_idx, row in enumerate(rows[1:]):
        if not any(cell.strip() for cell in row):
            continue
            
        # Create a text representation: "Header1: Val1 | Header2: Val2 ..."
        parts = []
        for i, cell in enumerate(row):
            h = headers[i] if i < len(headers) else f"Column{i+1}"
            parts.append(f"{h}: {cell.strip()}")
            
        row_text = " | ".join(parts)
        
        if len(row_text) > 5:
            clauses.append({
                "clause_id": f"CSV-R{row_idx+2}", # +2 because 1-indexed and header skipped
                "text": row_text,
                "page_number": 1,
                "severity": "INFO"
            })
            
    return clauses


def parse_yokogawa_csv(file_content: bytes, filename: str) -> List[Dict]:
    """Parse Yokogawa DL850EV ScopeCorder CSV export and extract measurement summaries."""
    print(f"DEBUG: Starting parse_yokogawa_csv for {filename}")
    text = file_content.decode('utf-8', errors='replace')
    lines = text.splitlines()
    
    # --- Parse the 15-row header ---
    header = {}
    header_size = 15  # default
    try:
        for line in lines[:1]:
            parts = line.split(',')
            if parts and 'Header Size' in parts[0]:
                try:
                    header_size = int(parts[1].strip())
                    print(f"DEBUG: Detected header size: {header_size}")
                except (ValueError, IndexError):
                    pass
    except Exception as e:
        print(f"DEBUG: Error reading Header Size row: {e}")
    
    def parse_header_row(line):
        reader_obj = csv.reader([line])
        row = next(reader_obj)
        key = row[0].strip().strip('"').strip()
        values = [v.strip().strip('"').strip() for v in row[1:] if v.strip()]
        return key, values
    
    print(f"DEBUG: Parsing {header_size} header rows...")
    for line in lines[:header_size]:
        try:
            key, values = parse_header_row(line)
            if key:
                header[key] = values
        except Exception as e:
            print(f"DEBUG: Error parsing header row '{line[:50]}': {e}")
    
    model_name = header.get('Model Name', ['Unknown'])[0]
    trace_names = header.get('TraceName', [])
    v_units = header.get('VUnit', [])
    sample_rate_str = header.get('SampleRate', ['0'])[0]
    h_resolution_str = header.get('HResolution', ['0'])[0]
    date_val = header.get('Date', ['Unknown'])[0]
    time_val = header.get('Time', ['Unknown'])[0]
    block_sizes = header.get('BlockSize', [])
    
    print(f"DEBUG: Header parsed. Model: {model_name}, Traces: {trace_names}")
    
    # Calculate actual sample rate from HResolution if available (more reliable)
    try:
        h_res = float(h_resolution_str)
        sample_rate_val = 1.0 / h_res if h_res > 0 else float(sample_rate_str)
        print(f"DEBUG: Sample rate calculated: {sample_rate_val} Hz")
    except (ValueError, ZeroDivisionError):
        try:
            sample_rate_val = float(sample_rate_str)
        except ValueError:
            sample_rate_val = 100000.0 # Default
    
    num_channels = len(trace_names)
    if num_channels == 0:
        print(f"DEBUG: ERROR - No TraceName found in header for {filename}")
        raise ValueError("CSV does not appear to be a Yokogawa DL850EV export (no TraceName found in header).")
    
    # --- Read numeric data ---
    data_start = header_size + 1 
    print(f"DEBUG: Starting data reading from line {data_start}...")
    channels = [[] for _ in range(num_channels)]
    
    row_count = 0
    for line in lines[data_start:]:
        line = line.strip()
        if not line:
            continue
        parts = line.split(',')
        values = [p.strip() for p in parts[1:] if p.strip()]
        for ch_idx in range(min(num_channels, len(values))):
            try:
                channels[ch_idx].append(float(values[ch_idx]))
            except (ValueError, IndexError):
                pass
        row_count += 1
    
    print(f"DEBUG: Read {row_count} data rows. Starting analysis...")
    
    # --- Compute per-channel statistics ---
    def calc_stats(data):
        if not data:
            return None
        n = len(data)
        mean = sum(data) / n
        sq_sum = sum(x * x for x in data)
        rms = math.sqrt(sq_sum / n)
        variance = sum((x - mean) ** 2 for x in data) / n
        std = math.sqrt(variance)
        return {
            'min': min(data),
            'max': max(data),
            'mean': mean,
            'rms': rms,
            'std': std,
            'peak_to_peak': max(data) - min(data),
            'samples': n
        }
    
    def count_zero_crossings_robust(data, hysteresis):
        """Count zero crossings using hysteresis to avoid noise-induced errors."""
        crossings = 0
        if not data: return 0
        
        # Determine initial state
        # state: 1 for positive, -1 for negative
        state = 1 if data[0] >= 0 else -1
        
        for val in data:
            if state == 1 and val < -hysteresis:
                state = -1
                crossings += 1
            elif state == -1 and val > hysteresis:
                state = 1
                crossings += 1
        return crossings

    def analyze_voltage_events(data, sample_rate, nominal_rms):
        """Detect voltage dips/sags and their duration."""
        if not data or sample_rate <= 0 or nominal_rms <= 0:
            return None
            
        # Use 10ms window (half cycle @ 50Hz) for RMS tracking
        window_size = int(0.01 * sample_rate) 
        if window_size < 1: window_size = 1
        
        event_threshold = 0.9 * nominal_rms # 90% threshold for sag
        recovery_threshold = 0.95 * nominal_rms # 95% for recovery
        
        events = []
        current_event_start = None
        min_v_in_event = nominal_rms
        
        # Simple moving RMS
        sq_sum = sum(x*x for x in data[:window_size])
        for i in range(0, len(data) - window_size, window_size):
            # Recalculate local RMS for this chunk
            chunk = data[i:i+window_size]
            local_rms = math.sqrt(sum(x*x for x in chunk) / len(chunk))
            
            if current_event_start is None:
                if local_rms < event_threshold:
                    current_event_start = i / sample_rate
                    min_v_in_event = local_rms
            else:
                min_v_in_event = min(min_v_in_event, local_rms)
                if local_rms > recovery_threshold:
                    duration = (i / sample_rate) - current_event_start
                    events.append({
                        'start_time': current_event_start,
                        'duration': duration,
                        'min_rms': min_v_in_event,
                        'depth_percent': (1.0 - min_v_in_event/nominal_rms) * 100
                    })
                    current_event_start = None
                    min_v_in_event = nominal_rms
                    
        # Handle ongoing event at end of file
        if current_event_start is not None:
             duration = (len(data) / sample_rate) - current_event_start
             events.append({
                'start_time': current_event_start,
                'duration': duration,
                'min_rms': min_v_in_event,
                'depth_percent': (1.0 - min_v_in_event/nominal_rms) * 100,
                'is_ongoing': True
             })
             
        return events

    clauses = []
    
    # Clause 1: Instrument metadata
    sample_rate_str = f"{sample_rate_val/1000:.1f} kHz" if sample_rate_val >= 1000 else f"{sample_rate_val:.1f} Hz"
    channel_list = ', '.join([f"{trace_names[i]} ({v_units[i] if i < len(v_units) else '?'})" for i in range(num_channels)])
    total_samples = int(block_sizes[0]) if block_sizes else (len(channels[0]) if channels[0] else 0)
    duration = total_samples / sample_rate_val if sample_rate_val > 0 else 0
    
    metadata_text = (
        f"Oscilloscope Measurement Data from {model_name}. "
        f"Date: {date_val}, Time: {time_val}. "
        f"Sample Rate: {sample_rate_str}. "
        f"Total Samples per Channel: {total_samples}. "
        f"Recording Duration: {duration:.3f} seconds. "
        f"Channels ({num_channels}): {channel_list}."
    )
    clauses.append({
        "clause_id": "CSV-META",
        "text": metadata_text,
        "page_number": 1,
        "severity": "INFO"
    })
    
    # Channels stats
    channel_stats = {}
    for ch_idx in range(num_channels):
        stats = calc_stats(channels[ch_idx])
        if stats is None:
            continue
        name = trace_names[ch_idx] if ch_idx < len(trace_names) else f"CH{ch_idx}"
        unit = v_units[ch_idx] if ch_idx < len(v_units) else '?'
        channel_stats[name] = {'stats': stats, 'unit': unit, 'data': channels[ch_idx]}
        
        ch_text = (
            f"Channel '{name}' Summary: "
            f"Unit={unit}, Min={stats['min']:.3f}, Max={stats['max']:.3f}, "
            f"Mean={stats['mean']:.3f}, RMS={stats['rms']:.3f}, "
            f"Peak-to-Peak={stats['peak_to_peak']:.3f}."
        )
        clauses.append({
            "clause_id": f"CSV-CH-{name}",
            "text": ch_text,
            "page_number": 1,
            "severity": "INFO"
        })
    
    # Waveform Analysis (Robust Frequency & Nominal Detection)
    waveform_texts = []
    detected_nominal_freq = 0
    detected_nominal_volt = 0
    
    for volt_ch in ['U-Volt', 'V-Volt']:
        if volt_ch in channel_stats:
            data = channel_stats[volt_ch]['data']
            rms = channel_stats[volt_ch]['stats']['rms']
            hysteresis = 0.05 * rms if rms > 1 else 0.5
            crossings = count_zero_crossings_robust(data, hysteresis)
            
            if sample_rate_val > 0 and len(data) > 0:
                duration_s = len(data) / sample_rate_val
                freq = crossings / (2.0 * duration_s)
                crest_factor = abs(channel_stats[volt_ch]['stats']['max'] / rms) if rms != 0 else 0
                
                # Nominal Frequency Detection
                if 45 < freq < 55: detected_nominal_freq = 50
                elif 55 < freq < 65: detected_nominal_freq = 60
                
                # Nominal Voltage Detection (RMS)
                if detected_nominal_volt == 0:
                    if 90 < rms < 110: detected_nominal_volt = 100
                    elif 190 < rms < 220: detected_nominal_volt = 200
                    elif 220 < rms < 245: detected_nominal_volt = 230
                
                waveform_texts.append(
                    f"{volt_ch}: Frequency={freq:.2f} Hz, "
                    f"RMS={rms:.2f} V, Crest Factor={crest_factor:.3f}"
                )
    
    if waveform_texts:
        nom_text = f" (Detected Nominal: {detected_nominal_freq}Hz, {detected_nominal_volt}V)" if detected_nominal_freq else ""
        clauses.append({
            "clause_id": "CSV-WAVEFORM",
            "text": f"Grid-Interactive Waveform Analysis{nom_text}: {'; '.join(waveform_texts)}.",
            "page_number": 1,
            "severity": "INFO"
        })

    # Power Analysis (Internal to events)
    all_power_data = {}
    for volt_ch, cur_ch, phase_label in [('U-Volt', 'U-Cur', 'U-Phase'), ('V-Volt', 'V-Cur', 'V-Phase')]:
        if volt_ch in channel_stats and cur_ch in channel_stats:
            v_data = channel_stats[volt_ch]['data']
            i_data = channel_stats[cur_ch]['data']
            n = min(len(v_data), len(i_data))
            if n > 0:
                all_power_data[phase_label] = [v_data[j] * i_data[j] for j in range(n)]

    # Voltage & Power Recovery Event Analysis (JETT-Specific)
    event_texts = []
    nom_v = detected_nominal_volt if detected_nominal_volt > 0 else 100 # Default to 100V for Japan if unsure
    
    for volt_ch in ['U-Volt', 'V-Volt']:
        if volt_ch in channel_stats:
            data = channel_stats[volt_ch]['data']
            stats = channel_stats[volt_ch]['stats']
            
            # Detect dips using either detected nominal or the channel's own mean
            ref_v = nom_v if (0.8 * nom_v < stats['rms'] < 1.2 * nom_v) else stats['rms']
            events = analyze_voltage_events(data, sample_rate_val, ref_v)
            
            if events:
                for e in events:
                    # Power Recovery Check (JETT Requirement)
                    phase_label = 'U-Phase' if 'U' in volt_ch else 'V-Phase'
                    recovery_note = ""
                    if phase_label in all_power_data:
                        p_data = all_power_data[phase_label]
                        # Calc pre-dip power average (10ms before)
                        pre_idx = max(0, int(e['start_time'] * sample_rate_val) - int(0.01 * sample_rate_val))
                        pre_p_avg = sum(p_data[pre_idx:int(e['start_time'] * sample_rate_val)]) / (int(0.01 * sample_rate_val) or 1)
                        
                        # Find when power recovers to 80% after voltage recovery
                        recovery_start_idx = int((e['start_time'] + e['duration']) * sample_rate_val)
                        p_recovery_time = -1
                        threshold_p = 0.8 * pre_p_avg
                        
                        for k in range(recovery_start_idx, len(p_data)):
                            if p_data[k] >= threshold_p:
                                p_recovery_time = (k - recovery_start_idx) / sample_rate_val
                                break
                        
                        if p_recovery_time >= 0:
                            recovery_note = f" (Power recovered to 80% in {p_recovery_time:.3f}s)"
                        else:
                            recovery_note = f" (Power did NOT recover to 80% within the recording)"

                    event_texts.append(
                        f"Voltage Sag on {volt_ch}: Start={e['start_time']:.3f}s, Duration={e['duration']:.3f}s, "
                        f"Residual Voltage={e['min_rms']:.1f}V ({100-e['depth_percent']:.1f}% of nominal){recovery_note}."
                    )
            else:
                event_texts.append(
                    f"No Voltage Sags (>10% drop) detected on {volt_ch}. "
                    f"Stability: Min={stats['min']:.1f}V, Max={stats['max']:.1f}V, Mean={stats['rms']:.1f}V."
                )
                    
    if event_texts:
        clauses.append({
            "clause_id": "CSV-EVENTS",
            "text": f"JETT Compliance - Voltage Dip & Recovery Analysis: {'; '.join(event_texts)}.",
            "page_number": 1,
            "severity": "INFO"
        })

    # Summary Power Analysis
    power_summary = []
    for phase_label, p_data in all_power_data.items():
        p_avg = sum(p_data) / len(p_data)
        p_max = max(p_data)
        power_summary.append(f"{phase_label}: Avg Power={p_avg:.1f}W, Peak={p_max:.1f}W")
    
    if power_summary:
        clauses.append({
            "clause_id": "CSV-POWER",
            "text": f"Power Output Summary: {', '.join(power_summary)}.",
            "page_number": 1,
            "severity": "INFO"
        })
    
    # Protection signals
    if 'GB' in channel_stats and 'Relay' in channel_stats:
        gb_s = channel_stats['GB']['stats']
        relay_s = channel_stats['Relay']['stats']
        clauses.append({
            "clause_id": "CSV-PROTECTION",
            "text": f"Protection Signals Status: GB Mean={gb_s['mean']:.4f}V (Max={gb_s['max']:.4f}V), Relay Mean={relay_s['mean']:.4f}V (Max={relay_s['max']:.4f}V).",
            "page_number": 1,
            "severity": "INFO"
        })
    
    return clauses


def refine_clauses(clauses: List[Dict]) -> List[Dict]:
    """
    Refines extracted clauses to improve AI response quality.
    - Filters out 'noise' (tiny fragments, purely numeric strings, decorative headers).
    - Merges sequential short fragments on the same page to provide richer context.
    """
    if not clauses:
        return []

    processed = []
    buffer_clause = None

    for c in clauses:
        text = c['text'].strip()
        
        # 1. NOISE FILTERING
        # Skip if extremely short (less than 25 chars)
        if len(text) < 25:
            continue
            
        # Skip if it's purely numeric/symbols (likely page numbers, version indices, or line noise)
        # At least 25% of the string should be alphabetical to be considered 'meaningful text'
        alpha_chars = sum(1 for char in text if char.isalpha())
        if alpha_chars / len(text) < 0.25:
            continue

        # 2. FRAGMENT MERGING
        # If the current clause is short, we merge it with the NEXT one to provide context
        # We only merge if they are on the same page and within the same general section
        if buffer_clause:
            # Condition for merging: same page and buffer is relatively short
            if buffer_clause['page_number'] == c['page_number'] and len(buffer_clause['text']) < 300:
                # Merge into buffer
                buffer_clause['text'] += " " + text
                # Keep the original clause_id if it was a 'header-type' ID, otherwise update
                continue
            else:
                # Flush the buffer
                processed.append(buffer_clause)
                buffer_clause = None

        buffer_clause = c.copy()
        buffer_clause['text'] = text

    if buffer_clause:
        processed.append(buffer_clause)

    return processed


def parse_document(file_content: bytes, filename: str, file_type: str, version: str = "1.0", namespace: str = None, session_id: str = None) -> int:
    """
    Parse a document (PDF, DOCX, or XLSX) and store in memory.
    Returns the document ID.
    """
    # Determine file type and parse
    filename_lower = filename.lower()
    
    if filename_lower.endswith('.pdf'):
        raw_clauses = parse_pdf(file_content, filename)
    elif filename_lower.endswith('.docx'):
        raw_clauses = parse_docx(file_content, filename)
    elif filename_lower.endswith('.xlsx'):
        raw_clauses = parse_xlsx(file_content, filename)
    elif filename_lower.endswith('.csv'):
        raw_clauses = parse_csv(file_content, filename)
    else:
        raise ValueError(f"Unsupported file type: {filename}")

    # APPLY REFINEMENT LAYER (Global for all types)
    # Special case: Instrument CSVs (Yokogawa) are already summarized and don't need merging
    if filename_lower.endswith('.csv') and any(c['clause_id'].startswith('CSV-') for c in raw_clauses):
        clauses = raw_clauses
    else:
        clauses = refine_clauses(raw_clauses)
    
    # Add document to in-memory store
    doc = store.add_document(session_id=session_id, filename=filename, file_type=file_type, version=version)
    
    # Add clauses to store and prepare for vector ingestion
    ingest_clauses = []
    for c in clauses:
        store.add_clause(
            session_id=session_id,
            document_id=doc.id,
            clause_id=c['clause_id'],
            text=c['text'],
            page_number=c['page_number'],
            severity=c['severity']
        )
        ingest_clauses.append({
            "status": "INGESTED", 
            "clause_id": c['clause_id'],
            "doc_id": doc.id,
            "doc_name": filename,
            "text": c['text'],
            "page_number": c['page_number']
        })
    
    # Ingest all documents into Vector DB
    if ingest_clauses:
        rag_engine.ingest_documents(ingest_clauses, session_id=session_id, namespace=namespace)
    
    return doc.id
