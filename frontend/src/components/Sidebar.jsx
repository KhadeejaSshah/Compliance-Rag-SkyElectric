import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Upload, FileText, CheckCircle, AlertTriangle, XCircle, Info, Database, Download, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

const Sidebar = ({ onAssessmentComplete, selectedNode, onStartAnalysis, onNodeClick, assessmentId, mode, useKb }) => {
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [selectedDocs, setSelectedDocs] = useState([]);

    // Color palette for file highlighting
    const colors = [
        { bg: '#70df27ff', border: '#21e03aff', name: 'green' },
        { bg: '#4ecdc4', border: '#26a69a', name: 'teal' },
        { bg: '#45b7d1', border: '#2196f3', name: 'blue' },
        { bg: '#96ceb4', border: '#66bb6a', name: 'green' },
        { bg: '#ffeaa7', border: '#ffeb3b', name: 'yellow' },
        { bg: '#dda0dd', border: '#ba68c8', name: 'plum' },
        { bg: '#fab1a0', border: '#ff7043', name: 'orange' },
        { bg: '#fd79a8', border: '#e91e63', name: 'pink' },
        { bg: '#a29bfe', border: '#673ab7', name: 'purple' },
        { bg: '#6c5ce7', border: '#3f51b5', name: 'indigo' }
    ];

    const getFileColor = (index) => colors[index % colors.length];

    useEffect(() => {
        fetchDocs();
    }, []);

    const fetchDocs = async () => {
        try {
            const res = await axios.get(`${API_BASE}/documents`);
            setFiles(res.data);

            // Auto-select all uploaded documents
            const allDocIds = res.data.map(doc => doc.id);
            setSelectedDocs(allDocIds);
        } catch (e) { console.error(e); }
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (!confirm("Delete this document?")) return;

        // Optimistic update
        const originalFiles = [...files];
        const originalSelected = [...selectedDocs];
        setFiles(files.filter(f => f.id !== id));
        setSelectedDocs(selectedDocs.filter(docId => docId !== id));

        try {
            await axios.delete(`${API_BASE}/documents/${id}`);
            fetchDocs();
        } catch (e) {
            alert("Delete failed");
            setFiles(originalFiles);
            setSelectedDocs(originalSelected);
        }
    };

    const handleReset = async () => {
        if (!confirm("This will clear ALL documents and assessments. Proceed?")) return;
        try {
            await axios.post(`${API_BASE}/reset`);
            fetchDocs();
            setSelectedDocs([]);
            onAssessmentComplete(null);
        } catch (e) { alert("Reset failed"); }
    };

    const handleUpload = async (e) => {
        const selectedFiles = Array.from(e.target.files);
        if (!selectedFiles.length) return;

        for (const file of selectedFiles) {
            const name = file.name.toLowerCase();
            if (!name.endsWith('.pdf') && !name.endsWith('.docx')) {
                alert("Only PDF and DOCX files are allowed.");
                return;
            }
        }

        if (files.length + selectedFiles.length > 10) {
            alert("Maximum 10 documents allowed.");
            return;
        }

        setUploading(true);
        setUploadProgress(0);

        try {
            const uploadPromises = selectedFiles.map(async (file, index) => {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('file_type', 'customer');

                return await axios.post(`${API_BASE}/upload`, formData, {
                    onUploadProgress: (progressEvent) => {
                        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        const totalProgress = ((index + (percentCompleted / 100)) / selectedFiles.length) * 100;
                        setUploadProgress(Math.round(totalProgress));
                    }
                });
            });

            await Promise.all(uploadPromises);
            fetchDocs();
        } catch (e) {
            alert("Upload failed.");
        } finally {
            setUploading(false);
            setUploadProgress(0);
        }
    };

    const handleToggleType = async (e, id, currentType) => {
        e.stopPropagation();
        const newType = currentType === 'regulation' ? 'customer' : 'regulation';

        // Optimistic update
        const originalFiles = [...files];
        setFiles(files.map(f => f.id === id ? { ...f, file_type: newType } : f));

        try {
            const formData = new FormData();
            formData.append('file_type', newType);
            await axios.patch(`${API_BASE}/documents/${id}/type`, formData);
        } catch (e) {
            console.error("Failed to update type:", e);
            setFiles(originalFiles);
        }
    };

    const runAssessment = async () => {
        const selectedFiles = files.filter(f => selectedDocs.includes(f.id));
        const standards = selectedFiles.filter(f => f.file_type === 'regulation');
        const projects = selectedFiles.filter(f => f.file_type === 'customer');

        if (standards.length === 0 || projects.length === 0) {
            alert("Analysis requires at least one Regulatory Standard and one Project Document.");
            return;
        }

        onStartAnalysis();

        try {
            const firstDoc = standards[0];
            const secondDoc = projects[0];

            console.log(`Analyzing: Standard=${firstDoc.filename}, Project=${secondDoc.filename} | KB=${useKb}`);
            const formData = new FormData();
            formData.append('customer_doc_id', secondDoc.id);
            formData.append('regulation_doc_id', firstDoc.id);
            formData.append('use_kb', useKb);

            const res = await axios.post(`${API_BASE}/assess`, formData);
            onAssessmentComplete(res.data.assessment_id);
        } catch (e) {
            console.error("Assessment Error:", e);
            const detail = e.response?.data?.detail || e.message;
            alert(`Assessment failed: ${detail}`);
            onAssessmentComplete(null);
        }
    };

    const toggleDocSelection = (docId) => {
        setSelectedDocs(prev => {
            if (prev.includes(docId)) {
                return prev.filter(id => id !== docId);
            } else {
                return [...prev, docId];
            }
        });
    };

    const isGraphMode = mode === 'graph';

    // Validation for "Analyze" button
    const selectedFiles = files.filter(f => selectedDocs.includes(f.id));
    const hasStandard = selectedFiles.some(f => f.file_type === 'regulation');
    const hasProject = selectedFiles.some(f => f.file_type === 'customer');
    const canAnalyze = hasStandard && hasProject;

    return (
        <div className="glass-panel" style={{ width: '400px', height: '100vh', padding: '24px', flexShrink: 0, overflowY: 'auto', borderRight: '1px solid rgba(255,255,255,0.1)', borderRadius: 0 }}>
            <h1 style={{ fontSize: '26px', fontWeight: 800, margin: '0 0 8px 0', background: 'linear-gradient(to right, #a855f7, #6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.5px' }}>
                SkyEngineering
            </h1>
            <p style={{ fontSize: '12px', opacity: 0.5, marginBottom: '24px' }}>Advanced Engineering Intelligence</p>

            <section style={{ marginBottom: '32px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', textTransform: 'uppercase', opacity: 0.6 }}>
                    <Upload size={16} /> {isGraphMode ? "Knowledge Ingestion" : "Cloud Storage"}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginTop: '12px' }}>
                    <label className="btn-primary" style={{
                        fontSize: '14px',
                        textAlign: 'center',
                        padding: '16px',
                        background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxSizing: 'border-box',
                        gap: '8px'
                    }}>
                        <Upload size={18} />
                        {isGraphMode ? "UPLOAD SOURCES (Max 10)" : "UPLOAD NEW SOURCE"}
                        <input type="file" hidden accept=".pdf,.docx" multiple={isGraphMode} onChange={(e) => handleUpload(e)} />
                    </label>
                    {isGraphMode && (
                        <div style={{ fontSize: '10px', opacity: 0.6, textAlign: 'center', marginTop: '8px', padding: '10px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '6px', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                            💡 Toggle each file type to **Standard** (AI Reference) or **Project** (Assessment Target).
                        </div>
                    )}
                </div>
            </section>

            <section style={{ marginBottom: '32px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', textTransform: 'uppercase', opacity: 0.6 }}>
                    <Database size={16} /> Asset Library
                    {isGraphMode && selectedDocs.length > 0 && (
                        <span style={{
                            marginLeft: 'auto',
                            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                            color: 'white',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '10px',
                            fontWeight: 'bold'
                        }}>
                            {selectedDocs.length} ASSETS
                        </span>
                    )}
                </h3>
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {uploading && (
                        <div style={{
                            padding: '12px',
                            borderRadius: '8px',
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <FileText size={18} color="#a855f7" className="animate-pulse" />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '14px', fontWeight: 500 }}>Ingesting...</div>
                                    <div style={{ fontSize: '11px', opacity: 0.5 }}>{uploadProgress}% completed</div>
                                </div>
                            </div>
                            <div style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                height: '2px',
                                background: 'linear-gradient(to right, #a855f7, #6366f1)',
                                width: `${uploadProgress}%`,
                                transition: 'width 0.2s ease-out'
                            }}></div>
                        </div>
                    )}
                    {files.map((f, index) => {
                        const color = getFileColor(index);
                        const isSelected = selectedDocs.includes(f.id);
                        const isReg = f.file_type === 'regulation';

                        return (
                            <div
                                key={f.id}
                                onClick={() => isGraphMode && toggleDocSelection(f.id)}
                                style={{
                                    padding: '12px',
                                    borderRadius: '8px',
                                    background: isGraphMode && isSelected
                                        ? 'rgba(255,255,255,0.08)'
                                        : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${isGraphMode && isSelected ? 'rgba(168, 85, 247, 0.4)' : 'transparent'}`,
                                    cursor: isGraphMode ? 'pointer' : 'default',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px',
                                    position: 'relative',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div
                                        style={{
                                            width: '8px',
                                            height: '8px',
                                            borderRadius: '50%',
                                            background: isReg ? '#a855f7' : '#10b981',
                                            boxShadow: `0 0 8px ${isReg ? '#a855f7' : '#10b981'}40`,
                                        }}
                                    />
                                    <FileText size={18} color={isSelected ? '#fff' : '#888'} />
                                    <div style={{ overflow: 'hidden', flex: 1 }}>
                                        <div
                                            title={f.filename}
                                            style={{
                                                fontSize: '14px',
                                                fontWeight: isSelected ? 600 : 500,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            <span style={{
                                                background: '#a855f7',
                                                color: '#fff',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                fontSize: '10px',
                                                fontWeight: 800,
                                                marginRight: '8px',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                                            }}>
                                                ID: {f.id}
                                            </span>
                                            {f.filename}
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => handleDelete(e, f.id)}
                                        style={{ background: 'transparent', border: 'none', color: '#ef4444', opacity: 0.3, cursor: 'pointer', padding: '4px' }}
                                        onMouseEnter={(e) => e.target.style.opacity = 1}
                                        onMouseLeave={(e) => e.target.style.opacity = 0.3}
                                    >
                                        <XCircle size={14} />
                                    </button>
                                </div>

                                {isGraphMode && (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', padding: '4px 8px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px' }}>
                                        <span style={{ fontSize: '10px', opacity: 0.6, fontWeight: 'bold' }}>
                                            {isReg ? "⚖️ STANDARD" : "📄 PROJECT"}
                                        </span>
                                        <button
                                            onClick={(e) => handleToggleType(e, f.id, f.file_type)}
                                            style={{
                                                fontSize: '9px',
                                                background: isReg ? 'rgba(168, 85, 247, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                                                border: `1px solid ${isReg ? '#a855f7' : '#10b981'}`,
                                                color: 'white',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            TOGGLE ROLE
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {isGraphMode && (
                    <div style={{ marginTop: '20px' }}>
                        <button
                            onClick={runAssessment}
                            disabled={!canAnalyze}
                            className="btn-primary"
                            style={{
                                width: '100%',
                                padding: '16px',
                                background: !canAnalyze
                                    ? 'rgba(255,255,255,0.05)'
                                    : 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                                color: !canAnalyze ? 'rgba(255,255,255,0.2)' : 'white',
                                border: !canAnalyze ? '1px solid rgba(255,255,255,0.1)' : 'none',
                                opacity: !canAnalyze ? 0.5 : 1
                            }}
                        >
                            <span style={{ fontWeight: 800 }}>RUN SKYENGINEERING™</span>
                        </button>
                        {!canAnalyze && files.length > 0 && (
                            <div style={{ fontSize: '10px', color: '#f59e0b', marginTop: '10px', textAlign: 'center', background: 'rgba(245, 158, 11, 0.05)', padding: '8px', borderRadius: '4px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                ⚠️ Requires selection of at least **1 Standard** and **1 Project** file.
                            </div>
                        )}
                    </div>
                )}

                <button
                    onClick={handleReset}
                    style={{ width: '100%', marginTop: '12px', padding: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#ef4444', borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}
                >
                    RESET ALL DATABASE
                </button>

                {isGraphMode && assessmentId && (
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
                {isGraphMode && selectedNode && (
                    <motion.section
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="glass-panel"
                        style={{ padding: '20px', background: 'rgba(255,255,255,0.03)' }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                            {selectedNode.status === 'COMPLIANT' ? <CheckCircle color="#10b981" size={24} /> : selectedNode.status === 'PARTIAL' ? <AlertTriangle color="#f59e0b" size={24} /> : selectedNode.status === 'NON_COMPLIANT' ? <XCircle color="#ef4444" size={24} /> : <Info color="#6366f1" size={24} />}
                            <h3 style={{ margin: 0, flex: 1 }}>Clause {selectedNode.label}</h3>
                            {selectedNode.page && (
                                <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', marginRight: '8px' }}>
                                    PAGE {selectedNode.page}
                                </span>
                            )}
                            <button onClick={() => onNodeClick(null)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', opacity: 0.7 }}><X size={16} /></button>
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
