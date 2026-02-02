# 🌌 Compliance Intelligence Galaxy
### 3D RAG-Powered Compliance Analysis & Visualization
### SkyElectric

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)]()

A state-of-the-art compliance analysis platform that uses **Retrieval-Augmented Generation (RAG)** and **Three.js** to visualize the relationship between customer policies and industry regulations.

---

## ✨ Key Features

- **🔭 3D Compliance Galaxy**: Visualize complex compliance relationships in an interactive, galaxy-inspired 3D scene.
- **🧠 Intelligent RAG Analysis**: Uses GPT-4 Turbo and FAISS vector embeddings to cross-reference clauses with high precision.
- **📄 Precise Traceability**: Automatically captures page numbers and provides literal evidence citations from source PDFs.
- **📊 Professional Reporting**: Generate and download comprehensive PDF audit reports with a single click.
- **🛠️ Knowledge Base Management**: Full CRUD operations for regulatory and customer documents.

---

## 🚀 Tech Stack

| Component | Technology |
| :--- | :--- |
| **Frontend** | React, Vite, Three.js (React Three Fiber), Framer Motion |
| **Backend** | FastAPI, SQLAlchemy, Uvicorn |
| **AI Layer** | LangChain, OpenAI (GPT-4), FAISS Vector Store |
| **PDF Engine** | PyPDF, ReportLab |
| **Styling** | Vanilla CSS (Modern Design System) |

---

## 🛠️ Quick Start

### 1. Prerequisites
- Node.js (v20.19+)
- Python 3.9+
- OpenAI API Key

### 2. Backend Setup
```bash
# Install dependencies
pip install -r requirements.txt

# Configure environment
echo "OPENAI_API_KEY=your_key_here" > .env

# Start server
export PYTHONPATH=$PYTHONPATH:.
python3 -m backend.main
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

---

## 📸 Visualization Preview

The **3D Compliance Galaxy** maps regulation clauses as planets and customer clauses as orbiting satellites, with color-coded status links showing compliance levels at a glance.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Developed with ❤️ by SkyElectric Team.
