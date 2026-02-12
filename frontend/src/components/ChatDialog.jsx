import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Bot, User, Maximize2, Minimize2, Zap, Shield, Globe, Upload, File, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import logo from '../assets/cleanlogo.png';
import ReactiveBackground from './ReactiveBackground';


const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

const ChatDialog = ({ isFullScreen = false, useKb = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [animationState, setAnimationState] = useState('idle');
    const [uploadedFile, setUploadedFile] = useState(null);
    const [uploadLoading, setUploadLoading] = useState(false);
    const scrollRef = useRef();
    const fileInputRef = useRef();


    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        return new Date(timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Check file type
        const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (!allowedTypes.includes(file.type)) {
            alert('Please upload only PDF or DOCX files.');
            return;
        }

        setUploadLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('file_type', 'session');
            formData.append('version', '1.0');

            await axios.post(`${API_BASE}/upload-session`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setUploadedFile({
                name: file.name,
                size: file.size,
                type: file.type
            });

            setMessages(prev => [...prev, {
                role: 'system',
                content: `📄 Document "${file.name}" uploaded successfully! Now I will ALWAYS use both your document AND the knowledge base together to provide comprehensive, cross-referenced answers. Ask me anything!`,
                timestamp: new Date()
            }]);

        } catch (error) {
            console.error('Upload error:', error);
            setMessages(prev => [...prev, {
                role: 'system',
                content: `❌ Failed to upload "${file.name}". Please try again.`,
                timestamp: new Date()
            }]);
        } finally {
            setUploadLoading(false);
        }
    };

    const handleRemoveFile = () => {
        setUploadedFile(null);
        setMessages(prev => [...prev, {
            role: 'system',
            content: `📄 Document removed from session. Questions will now only use the knowledge base.`,
            timestamp: new Date()
        }]);
    };

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg = { role: 'user', content: input, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);
        setAnimationState('thinking');

        try {
            const formData = new FormData();
            formData.append('query', input);
            // Always use KB when file is uploaded for comprehensive answers
            formData.append('use_kb', uploadedFile ? 'true' : (useKb ? 'true' : 'false'));
            formData.append('has_session_file', uploadedFile ? 'true' : 'false');
            const res = await axios.post(`${API_BASE}/chat`, formData);

            setAnimationState('response');
            setMessages(prev => [...prev, { role: 'bot', content: res.data.answer, timestamp: new Date() }]);
            // Reset to idle after response animation
            setTimeout(() => setAnimationState('idle'), 2000);
        } catch (e) {
            setAnimationState('idle');
            setMessages(prev => [...prev, { role: 'bot', content: "Failed to connect to the AI analyst. Is the backend running?", timestamp: new Date() }]);
        } finally {
            setLoading(false);
        }
    };


    const containerStyle = isFullScreen ? {
        width: '100%',
        maxWidth: '1000px',
        height: '100%',
        maxHeight: '800px',
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '24px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 50px rgba(0,0,0,0.05)',
        overflow: 'hidden',
        position: 'relative'
    } : {

        position: 'fixed',
        bottom: '100px',
        right: '24px',
        width: '400px',
        height: '500px',
        background: 'rgba(20, 20, 25, 0.95)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        zIndex: 101,
        overflow: 'hidden'
    };

    const chatContent = (
        <div style={containerStyle}>
            {/* Header */}
            <div style={{
                padding: isFullScreen ? '24px' : '16px',
                background: '#ffffff',
                borderBottom: '1px solid #f3f4f6',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

                    <div style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: '#10b981',
                        boxShadow: '0 0 10px #10b981'
                    }}></div>
                    <span style={{ fontWeight: 'bold', fontSize: isFullScreen ? '18px' : '14px', color: '#111827' }}>
                        SkyEngineering AI
                    </span>
                </div>
                {!isFullScreen && (
                    <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer' }}>
                        <X size={20} />
                    </button>
                )}

            </div>

            {/* Messages */}
            <div ref={scrollRef} style={{
                flex: 1,
                padding: isFullScreen ? '32px' : '16px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
            }}>
                {messages.length === 0 && (
                    <div style={{ textAlign: 'center', marginTop: isFullScreen ? '40px' : '20px', padding: '0 20px' }}>
                        <img src={logo} alt="SkyChat Logo" style={{ width: '100px', height: '80px', marginBottom: '0px' }} />
                        <h1 style={{ fontSize: isFullScreen ? '32px' : '24px', fontWeight: 'bold', color: '#111827', marginBottom: '8px' }}>
                            Welcome to SkyEngineering
                        </h1>
                        <p style={{ fontSize: isFullScreen ? '18px' : '16px', color: '#6b7280', marginBottom: '38px' }}>
                            Ask questions, get help, or just chat!
                        </p>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: '10px',
                            maxWidth: '700px',
                            margin: '0 auto'
                        }}>
                            {[
                                { title: 'Natural Conversations', desc: 'Chat naturally with our AI assistant', icon: <MessageSquare size={20} color="#6b7280" />, bg: '#f9fafb' },
                                { title: 'Fast Responses', desc: 'Get quick and accurate answers', icon: <Zap size={20} color="#6b7280" />, bg: '#f9fafb' },
                                { title: 'Secure & Private', desc: 'Your conversations are protected', icon: <Shield size={20} color="#6b7280" />, bg: '#f9fafb' },
                                { title: 'Always Available', desc: '24/7 assistance whenever you need it', icon: <Globe size={20} color="#6b7280" />, bg: '#f9fafb' }
                            ].map((feature, i) => (
                                <div key={i} style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '16px',
                                    padding: '0px',
                                    background: feature.bg,
                                    borderRadius: '16px',
                                    textAlign: 'left'
                                }}>
                                    <div style={{
                                        width: '40px',
                                        marginTop: '20px',
                                        marginLeft: '10px',
                                        height: '40px',
                                        borderRadius: '10px',
                                        background: '#ffffff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                    }}>
                                        {feature.icon}
                                    </div>
                                    <div>
                                        <h4 style={{ fontSize: '16px', fontWeight: 'bold', color: '#111827', marginBottom: '4px' }}>{feature.title}</h4>
                                        <p style={{ fontSize: '14px', color: '#6b7280', lineHeight: 1.4 }}>{feature.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((m, idx) => (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={idx}
                        style={{
                            alignSelf: m.role === 'user' ? 'flex-end' : m.role === 'system' ? 'center' : 'flex-start',
                            maxWidth: m.role === 'system' ? '100%' : '85%',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                        }}
                    >
                        <div style={{
                            padding: m.role === 'system' ? '8px 16px' : (isFullScreen ? '12px 20px' : '10px 14px'),
                            borderRadius: m.role === 'system' ? '8px' : (m.role === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px'),
                            background: m.role === 'user' ? '#2563eb' : m.role === 'system' ? '#f0f9ff' : '#f3f4f6',
                            color: m.role === 'user' ? '#ffffff' : m.role === 'system' ? '#0c4a6e' : '#1f2937',
                            fontSize: m.role === 'system' ? '13px' : (isFullScreen ? '15px' : '14px'),
                            lineHeight: 1.5,
                            textAlign: m.role === 'system' ? 'center' : 'left',
                            border: m.role === 'system' ? '1px solid #bae6fd' : 'none'
                        }}>
                            {m.content}
                        </div>
                        {m.timestamp && m.role !== 'system' && (
                            <div style={{
                                fontSize: '11px',
                                color: '#9ca3af',
                                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                                marginTop: '2px',
                                paddingLeft: m.role === 'user' ? '0' : '8px',
                                paddingRight: m.role === 'user' ? '8px' : '0'
                            }}>
                                {formatTime(m.timestamp)}
                            </div>
                        )}
                    </motion.div>
                ))}
                {loading && (
                    <div style={{ alignSelf: 'flex-start', padding: '12px 18px', borderRadius: '16px 16px 16px 0', background: 'rgba(255,255,255,0.08)' }}>
                        <div className="dot-flashing"></div>
                    </div>
                )}
            </div>

            {/* Input */}
            <div style={{ padding: isFullScreen ? '24px' : '16px', background: '#ffffff', borderTop: '1px solid #f3f4f6' }}>
                {/* File Upload Section */}
                {isFullScreen && (
                    <div style={{ marginBottom: '16px' }}>
                        {!uploadedFile ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf,.docx"
                                    onChange={handleFileUpload}
                                    style={{ display: 'none' }}
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploadLoading}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '8px 16px',
                                        background: uploadLoading ? '#e5e7eb' : '#f3f4f6',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '8px',
                                        cursor: uploadLoading ? 'not-allowed' : 'pointer',
                                        fontSize: '14px',
                                        color: '#374151',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <Upload size={16} />
                                    {uploadLoading ? 'Uploading...' : 'Upload PDF/DOCX'}
                                </button>
                                <span style={{ fontSize: '12px', color: '#6b7280' }}>
                                    Upload your document - it will be cross-referenced with our knowledge base for verification
                                </span>
                            </div>
                        ) : (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '12px 16px',
                                background: '#f0f9ff',
                                border: '1px solid #bae6fd',
                                borderRadius: '8px',
                                marginBottom: '12px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <File size={16} style={{ color: '#0284c7' }} />
                                    <div>
                                        <div style={{ fontSize: '14px', fontWeight: '500', color: '#0c4a6e' }}>
                                            {uploadedFile.name}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#0284c7' }}>
                                            {(uploadedFile.size / 1024).toFixed(1)} KB • Ready for questions
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={handleRemoveFile}
                                    style={{
                                        padding: '4px',
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#ef4444',
                                        cursor: 'pointer',
                                        borderRadius: '4px'
                                    }}
                                    title="Remove file"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        )}
                    </div>
                )}
                
                <div style={{
                    display: 'flex',
                    gap: '12px',
                    background: '#f9fafb',
                    padding: isFullScreen ? '12px 20px' : '10px 14px',
                    borderRadius: '16px',
                    border: '1px solid #e5e7eb'
                }}>
                    <input
                        value={input}
                        onChange={(e) => {
                            setInput(e.target.value);
                            if (e.target.value.trim() && animationState === 'idle') {
                                setAnimationState('typing');
                            } else if (!e.target.value.trim() && animationState === 'typing') {
                                setAnimationState('idle');
                            }
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Ask anything..."
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            color: '#111827',
                            outline: 'none',
                            fontSize: isFullScreen ? '16px' : '14px'
                        }}
                    />


                    <button
                        onClick={handleSend}
                        disabled={loading}
                        style={{
                            background: '#2563eb',
                            border: 'none',
                            color: 'white',
                            cursor: 'pointer',
                            opacity: loading ? 0.5 : 1,
                            padding: '10px',
                            borderRadius: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Send size={isFullScreen ? 20 : 18} />
                    </button>

                </div>
                {isFullScreen && (
                    <p style={{ marginTop: '12px', fontSize: '12px', opacity: 0.4, textAlign: 'center' }}>
                        SkyEngineering can make mistakes. Consider checking important information.
                    </p>
                )}
            </div>

            <style jsx="true">{`
                .dot-flashing {
                    position: relative;
                    width: 6px;
                    height: 6px;
                    border-radius: 5px;
                    background-color: #6366f1;
                    color: #6366f1;
                    animation: dot-flashing 1s infinite linear alternate;
                    animation-delay: .5s;
                }
                .dot-flashing::before, .dot-flashing::after {
                    content: '';
                    display: inline-block;
                    position: absolute;
                    top: 0;
                }
                .dot-flashing::before {
                    left: -12px;
                    width: 6px;
                    height: 6px;
                    border-radius: 5px;
                    background-color: #6366f1;
                    color: #6366f1;
                    animation: dot-flashing 1s infinite alternate;
                    animation-delay: 0s;
                }
                .dot-flashing::after {
                    left: 12px;
                    width: 6px;
                    height: 6px;
                    border-radius: 5px;
                    background-color: #6366f1;
                    color: #6366f1;
                    animation: dot-flashing 1s infinite alternate;
                    animation-delay: 1s;
                }
                @keyframes dot-flashing {
                    0% { background-color: #6366f1; }
                    50%, 100% { background-color: rgba(99, 102, 241, 0.2); }
                }
            `}</style>
        </div>
    );

    if (isFullScreen) {
        return (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                <ReactiveBackground state={animationState} />
                <div style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {chatContent}
                </div>
            </div>
        );
    }


    return (
        <>
            {/* Floating Toggle Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    style={{
                        position: 'fixed',
                        bottom: '24px',
                        right: '24px',
                        width: '60px',
                        height: '60px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 8px 24px rgba(168, 85, 247, 0.4)',
                        cursor: 'pointer',
                        border: 'none',
                        zIndex: 100,
                        transition: 'transform 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                    <MessageSquare size={28} />
                </button>
            )}

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                        style={{ position: 'fixed', bottom: '100px', right: '24px', zIndex: 101 }}
                    >
                        {chatContent}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default ChatDialog;
