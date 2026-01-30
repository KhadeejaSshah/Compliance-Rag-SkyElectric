import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Upload, FileText, CheckCircle, AlertTriangle, XCircle, Info, Database, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

const Sidebar = ({ onAssessmentComplete, selectedNode, onStartAnalysis, assessmentId }) => {
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [activeDoc, setActiveDoc] = useState({ regulation: null, customer: null });

    useEffect(() => {
        fetchDocs();
    }, []);

    const fetchDocs = async () => {
        try {
            const res = await axios.get(`${API_BASE}/documents`);
            setFiles(res.data);
        } catch (e) { console.error(e); }
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (!confirm("Delete this document?")) return;

        // Optimistic update
        const originalFiles = [...files];
        setFiles(files.filter(f => f.id !== id));

        try {
            await axios.delete(`${API_BASE}/documents/${id}`);
            if (activeDoc.regulation === id) setActiveDoc(p => ({ ...p, regulation: null }));
            if (activeDoc.customer === id) setActiveDoc(p => ({ ...p, customer: null }));
            // Refresh in background to stay in sync
            fetchDocs();
        } catch (e) {
            alert("Delete failed");
            setFiles(originalFiles); // Rollback if failed
        }
    };

    const handleReset = async () => {
        if (!confirm("This will clear ALL documents and assessments. Proceed?")) return;
        try {
            await axios.post(`${API_BASE}/reset`);
            fetchDocs();
            setActiveDoc({ regulation: null, customer: null });
            onAssessmentComplete(null); // Reset graph
        } catch (e) { alert("Reset failed"); }
    };

    const handleUpload = async (e, type) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('file_type', type);

        try {
            await axios.post(`${API_BASE}/upload`, formData);
            fetchDocs();
        } catch (e) {
            alert("Upload failed. Check if backend is running.");
        } finally {
            setUploading(false);
        }
    };

    const runAssessment = async () => {
        if (!activeDoc.regulation || !activeDoc.customer) {
            alert("Select both a regulation and a customer document.");
            return;
        }

        onStartAnalysis(); // Trigger loading state immediately in App.jsx

        try {
            const res = await axios.post(`${API_BASE}/assess?customer_doc_id=${activeDoc.customer}&regulation_doc_id=${activeDoc.regulation}`);
            onAssessmentComplete(res.data.assessment_id);
        } catch (e) {
            alert("Assessment failed. Ensure API key is set in backend.");
            onAssessmentComplete(null);
        }
    };

    return (
        <div className="glass-panel" style={{ width: '400px', height: '100vh', padding: '24px', flexShrink: 0, overflowY: 'auto', borderRight: '1px solid rgba(255,255,255,0.1)', borderRadius: 0 }}>
            <h1 style={{ fontSize: '24px', margin: '0 0 24px 0', background: 'linear-gradient(to right, #a855f7, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Compliance Galaxy
            </h1>

            <section style={{ marginBottom: '32px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', textTransform: 'uppercase', opacity: 0.6 }}>
                    <Upload size={16} /> Data Ingestion
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                    <label className="btn-primary" style={{ fontSize: '12px', textAlign: 'center', padding: '12px' }}>
                        REGULATION PDF
                        <input type="file" hidden onChange={(e) => handleUpload(e, 'regulation')} />
                    </label>
                    <label className="btn-primary" style={{ fontSize: '12px', textAlign: 'center', padding: '12px', background: '#3b82f6' }}>
                        CUSTOMER PDF
                        <input type="file" hidden onChange={(e) => handleUpload(e, 'customer')} />
                    </label>
                </div>
            </section>

            <section style={{ marginBottom: '32px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', textTransform: 'uppercase', opacity: 0.6 }}>
                    <Database size={16} /> Knowledge Base
                </h3>
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {files.map(f => (
                        <div
                            key={f.id}
                            onClick={() => setActiveDoc(prev => ({ ...prev, [f.file_type]: f.id }))}
                            style={{
                                padding: '12px',
                                borderRadius: '8px',
                                background: activeDoc[f.file_type] === f.id
                                    ? (f.file_type === 'regulation' ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.3) 0%, rgba(168, 85, 247, 0.3) 100%)' : 'rgba(59, 130, 246, 0.3)')
                                    : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${activeDoc[f.file_type] === f.id
                                    ? (f.file_type === 'regulation' ? '#a855f7' : '#3b82f6')
                                    : 'transparent'}`,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                position: 'relative'
                            }}
                        >
                            <FileText size={18} color={f.file_type === 'regulation' ? '#a855f7' : '#3b82f6'} />
                            <div style={{ overflow: 'hidden', flex: 1 }}>
                                <div style={{ fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</div>
                                <div style={{ fontSize: '11px', opacity: 0.5 }}>v{f.version} • {f.file_type}</div>
                            </div>
                            <button
                                onClick={(e) => handleDelete(e, f.id)}
                                style={{ background: 'transparent', border: 'none', color: '#ef4444', opacity: 0.5, cursor: 'pointer', padding: '4px' }}
                                onMouseEnter={(e) => e.target.style.opacity = 1}
                                onMouseLeave={(e) => e.target.style.opacity = 0.5}
                            >
                                <XCircle size={14} />
                            </button>
                        </div>
                    ))}
                </div>
                <button
                    onClick={runAssessment}
                    disabled={!activeDoc.regulation || !activeDoc.customer}
                    className="btn-primary"
                    style={{
                        width: '100%',
                        marginTop: '16px',
                        padding: '14px',
                        background: (!activeDoc.regulation || !activeDoc.customer) ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
                        color: (!activeDoc.regulation || !activeDoc.customer) ? 'rgba(255,255,255,0.3)' : 'white'
                    }}
                >
                    {(!activeDoc.regulation && !activeDoc.customer)
                        ? "SELECT DOCUMENTS"
                        : (!activeDoc.regulation || !activeDoc.customer)
                            ? "SELECT REMAINING DOC"
                            : "ANALYZE (2 DOCS SELECTED)"}
                </button>
                <button
                    onClick={handleReset}
                    style={{ width: '100%', marginTop: '12px', padding: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#ef4444', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}
                >
                    RESET ALL DATABASE
                </button>

                {assessmentId && (
                    <button
                        onClick={() => window.open(`${API_BASE}/report/${assessmentId}`, '_blank')}
                        className="btn-primary"
                        style={{
                            width: '100%',
                            marginTop: '24px',
                            padding: '14px',
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px'
                        }}
                    >
                        <Download size={18} />
                        DOWNLOAD PDF REPORT
                    </button>
                )}
            </section>

            <AnimatePresence>
                {selectedNode && (
                    <motion.section
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="glass-panel"
                        style={{ padding: '20px', background: 'rgba(255,255,255,0.03)' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            {selectedNode.status === 'COMPLIANT' ? <CheckCircle color="#10b981" size={24} /> : selectedNode.status === 'PARTIAL' ? <AlertTriangle color="#f59e0b" size={24} /> : selectedNode.status === 'NON_COMPLIANT' ? <XCircle color="#ef4444" size={24} /> : <Info color="#6366f1" size={24} />}
                            <h3 style={{ margin: 0 }}>Clause {selectedNode.label}</h3>
                            {selectedNode.page && (
                                <span style={{ marginLeft: 'auto', fontSize: '11px', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                                    PAGE {selectedNode.page}
                                </span>
                            )}
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <span style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>AI Reasoning</span>
                            <p style={{ fontSize: '14px', opacity: 0.8, lineHeight: 1.6, margin: 0 }}>
                                {selectedNode.reasoning || selectedNode.text}
                            </p>
                        </div>

                        {selectedNode.evidence && selectedNode.evidence !== 'N/A' && (
                            <div style={{ marginBottom: '20px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderLeft: '3px solid #6366f1', borderRadius: '4px' }}>
                                <span style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase', display: 'block', marginBottom: '4px', color: '#6366f1' }}>Literal Evidence Citation</span>
                                <p style={{ fontSize: '13px', fontStyle: 'italic', opacity: 0.9, margin: 0 }}>
                                    "{selectedNode.evidence}"
                                </p>
                            </div>
                        )}

                        {selectedNode.risk && (
                            <div style={{ display: 'flex', gap: '24px' }}>
                                <div>
                                    <span style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase' }}>Risk Level</span>
                                    <div style={{ color: selectedNode.risk === 'HIGH' ? '#ef4444' : selectedNode.risk === 'MEDIUM' ? '#f59e0b' : '#10b981', fontWeight: 'bold' }}>{selectedNode.risk}</div>
                                </div>
                                <div>
                                    <span style={{ fontSize: '11px', opacity: 0.5, textTransform: 'uppercase' }}>Status</span>
                                    <div style={{ color: selectedNode.status === 'COMPLIANT' ? '#10b981' : selectedNode.status === 'PARTIAL' ? '#f59e0b' : '#ef4444', fontWeight: 'bold' }}>{selectedNode.status}</div>
                                </div>
                            </div>
                        )}
                    </motion.section>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Sidebar;
