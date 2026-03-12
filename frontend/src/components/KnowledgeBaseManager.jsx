import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Upload, FileText, Trash2, X, Plus, Database, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

const KnowledgeBaseManager = ({ isOpen, onClose, selectedIds = [], onSelectionChange }) => {
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    useEffect(() => {
        if (isOpen) {
            fetchKbDocs();
        }
    }, [isOpen]);

    const fetchKbDocs = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/kb/documents`);
            setFiles(res.data);
            setError(null);
        } catch (e) {
            console.error("Failed to fetch KB docs:", e);
            setError("Failed to load knowledge base documents.");
        } finally {
            setLoading(false);
        }
    };

    const toggleSelection = (id) => {
        if (selectedIds.includes(id)) {
            onSelectionChange(selectedIds.filter(sid => sid !== id));
        } else {
            onSelectionChange([...selectedIds, id]);
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === files.length) {
            onSelectionChange([]);
        } else {
            onSelectionChange(files.map(f => f.id));
        }
    };

    const handleUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const allowedExtensions = ['.pdf', '.docx', '.csv', '.xlsx'];
        const name = file.name.toLowerCase();
        if (!allowedExtensions.some(ext => name.endsWith(ext))) {
            setError("Unsupported file format. Please upload PDF, DOCX, CSV or XLSX.");
            return;
        }

        setUploading(true);
        setError(null);
        setSuccess(null);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('version', '1.0');

        try {
            const res = await axios.post(`${API_BASE}/kb/upload`, formData);
            setSuccess(`"${file.name}" added to permanent knowledge base.`);
            // Automatically select the new file
            const newDocId = res.data.doc_id;
            onSelectionChange([...selectedIds, newDocId]);
            fetchKbDocs();
        } catch (e) {
            console.error("KB Upload failed:", e);
            setError("Failed to upload document to knowledge base.");
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation(); // Don't trigger selection toggle
        if (!confirm("Are you sure you want to remove this document from the permanent knowledge base?")) return;

        try {
            await axios.delete(`${API_BASE}/kb/documents/${id}`);
            setFiles(files.filter(f => f.id !== id));
            onSelectionChange(selectedIds.filter(sid => sid !== id));
            setSuccess("Document removed from knowledge base.");
        } catch (e) {
            console.error("KB delete failed:", e);
            setError("Failed to delete document.");
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
        }}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                    background: '#ffffff',
                    width: '100%',
                    maxWidth: '600px',
                    borderRadius: '16px',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '80vh'
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid #f3f4f6',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'linear-gradient(to right, #f9fafb, #ffffff)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            background: '#eff6ff',
                            padding: '8px',
                            borderRadius: '10px',
                            color: '#3b82f6'
                        }}>
                            <Database size={24} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#111827' }}>Knowledge Base Manager</h2>
                            <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>Global document repository for permanent insights</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#9ca3af',
                            cursor: 'pointer',
                            padding: '4px',
                            borderRadius: '6px',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                    {error && (
                        <div style={{
                            padding: '12px 16px',
                            background: '#fef2f2',
                            border: '1px solid #fee2e2',
                            borderRadius: '8px',
                            color: '#b91c1c',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '16px'
                        }}>
                            <AlertCircle size={18} />
                            {error}
                        </div>
                    )}

                    {success && (
                        <div style={{
                            padding: '12px 16px',
                            background: '#f0fdf4',
                            border: '1px solid #dcfce7',
                            borderRadius: '8px',
                            color: '#15803d',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: '16px'
                        }}>
                            <CheckCircle2 size={18} />
                            {success}
                        </div>
                    )}

                    <div style={{ marginBottom: '24px' }}>
                        <label style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '32px 16px',
                            border: '2px dashed #e5e7eb',
                            borderRadius: '12px',
                            cursor: uploading ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            background: uploading ? '#f9fafb' : 'transparent'
                        }}
                            onMouseEnter={e => !uploading && (e.currentTarget.style.borderColor = '#3b82f6')}
                            onMouseLeave={e => !uploading && (e.currentTarget.style.borderColor = '#e5e7eb')}
                        >
                            <input type="file" hidden onChange={handleUpload} disabled={uploading} />
                            <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '50%',
                                background: '#f5f3ff',
                                color: '#8b5cf6',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: '12px'
                            }}>
                                <Upload size={24} className={uploading ? "animate-bounce" : ""} />
                            </div>
                            <span style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937' }}>
                                {uploading ? "Uploading to KB..." : "Upload to Knowledge Base"}
                            </span>
                            <span style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                                PDF, DOCX, CSV or XLSX up to 10MB
                            </span>
                        </label>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', margin: 0 }}>
                                {files.length > 0 ? `Permanent Documents (${files.length})` : 'Permanent Documents'}
                            </h3>
                            {files.length > 0 && (
                                <button
                                    onClick={toggleSelectAll}
                                    style={{
                                        fontSize: '12px',
                                        color: '#3b82f6',
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontWeight: 500
                                    }}
                                >
                                    {selectedIds.length === files.length ? 'Deselect All' : 'Select All'}
                                </button>
                            )}
                        </div>

                        {loading && files.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Loading...</div>
                        ) : files.length === 0 ? (
                            <div style={{
                                textAlign: 'center',
                                padding: '40px',
                                color: '#9ca3af',
                                background: '#f9fafb',
                                borderRadius: '8px',
                                border: '1px solid #f3f4f6'
                            }}>
                                No documents in the knowledge base yet.
                            </div>
                        ) : (
                            files.map(file => {
                                const isSelected = selectedIds.includes(file.id);
                                return (
                                    <div
                                        key={file.id}
                                        onClick={() => toggleSelection(file.id)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '12px 16px',
                                            background: isSelected ? '#eff6ff' : '#ffffff',
                                            border: '1px solid',
                                            borderColor: isSelected ? '#bfdbfe' : '#e5e7eb',
                                            borderRadius: '10px',
                                            transition: 'all 0.2s',
                                            cursor: 'pointer'
                                        }}
                                        onMouseEnter={e => !isSelected && (e.currentTarget.style.borderColor = '#d1d5db')}
                                        onMouseLeave={e => !isSelected && (e.currentTarget.style.borderColor = '#e5e7eb')}
                                    >
                                        <div style={{
                                            width: '18px',
                                            height: '18px',
                                            borderRadius: '4px',
                                            border: `2px solid ${isSelected ? '#3b82f6' : '#d1d5db'}`,
                                            background: isSelected ? '#3b82f6' : 'transparent',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0
                                        }}>
                                            {isSelected && <div style={{ width: '8px', height: '2px', background: '#fff', borderRadius: '1px' }} />}
                                        </div>
                                        <div style={{ color: isSelected ? '#3b82f6' : '#6b7280' }}>
                                            <FileText size={20} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: '14px',
                                                fontWeight: 500,
                                                color: '#111827',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>
                                                {file.filename}
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                                                Added on {new Date(file.uploaded_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => handleDelete(e, file.id)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: '#ef4444',
                                                cursor: 'pointer',
                                                padding: '8px',
                                                borderRadius: '6px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                opacity: 0.4
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.opacity = 1}
                                            onMouseLeave={e => e.currentTarget.style.opacity = 0.4}
                                            title="Remove from knowledge base"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 24px',
                    borderTop: '1px solid #f3f4f6',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#f9fafb'
                }}>
                    <div style={{ fontSize: '13px', color: '#6b7280' }}>
                        {selectedIds.length} document{selectedIds.length !== 1 ? 's' : ''} selected
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 24px',
                            background: '#3b82f6',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#ffffff',
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                        }}
                    >
                        Apply Selection
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default KnowledgeBaseManager;
