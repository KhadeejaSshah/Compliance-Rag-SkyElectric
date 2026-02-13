import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Bot, User, Maximize2, Minimize2, Zap, Shield, Globe, Upload, File, FileText, Trash2, PlusSquare, Paperclip } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import logo from '../assets/cleanlogo.png';
import ReactiveBackground from './ReactiveBackground';


const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

const ChatDialog = ({
    isFullScreen = false,
    useKb = false,
    messages = [],
    onSendMessage,
    onNewChat
}) => {
    const [isOpen, setIsOpen] = useState(false);
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



    const renderSources = (sources) => {
        if (!sources || sources.length === 0) return null;

        return (
            <div
                style={{
                    marginTop: '10px',
                    paddingTop: '10px',
                    borderTop: '1px solid #e5e7eb'
                }}
            >
                <div style={{
                    fontWeight: 600,
                    fontSize: '0.8em',
                    marginBottom: '8px'
                }}>
                    Sources
                </div>

                {sources.map((src) => (
                    <div
                        key={src.id}
                        style={{
                            padding: '6px 8px',
                            marginBottom: '6px',
                            background: '#f9fafb',
                            borderRadius: '6px',
                            fontSize: '0.82em'
                        }}
                    >
                        <strong>[{src.id}]</strong> {src.title}
                        {src.clause && <> | Clause: {src.clause}</>}
                        {src.page && <> | Page: {src.page}</>}
                    </div>
                ))}
            </div>
        );
    };
    ////////////
    const renderMessage = (content, role, sources = []) => {
        if (!content) return null;

        const applyInlineFormatting = (text) => {
            const regex = /(\*\*(.*?)\*\*|`(.*?)`|\[(KB|DOC)\s+\d+\])/g;
            const segments = [];
            let lastIndex = 0;
            let match;

            while ((match = regex.exec(text)) !== null) {
                if (match.index > lastIndex) {
                    segments.push(text.substring(lastIndex, match.index));
                }

                if (match[2]) {
                    segments.push(
                        <strong key={match.index}>{match[2]}</strong>
                    );
                } else if (match[3]) {
                    segments.push(
                        <code
                            key={match.index}
                            style={{
                                background: role === 'user' ? 'rgba(255,255,255,0.2)' : '#e5e7eb',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '0.85em'
                            }}
                        >
                            {match[3]}
                        </code>
                    );
                } else if (match[4]) {
                    const isKB = match[4] === 'KB';
                    segments.push(
                        <span
                            key={match.index}
                            style={{
                                background: isKB ? '#eef2ff' : '#ecfdf5',
                                color: isKB ? '#6366f1' : '#059669',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '0.75em',
                                fontWeight: 600
                            }}
                        >
                            {match[0]}
                        </span>
                    );
                }

                lastIndex = regex.lastIndex;
            }

            if (lastIndex < text.length) {
                segments.push(text.substring(lastIndex));
            }

            return segments;
        };

        const formatText = (text) => {
            const lines = text.split('\n');
            const elements = [];
            let i = 0;

            while (i < lines.length) {
                const line = lines[i];

                if (line.match(/^#{1,3}\s+/)) {
                    const level = line.match(/^(#+)/)[1].length;
                    const headerText = line.replace(/^#+\s+/, '');
                    elements.push(
                        <div
                            key={i}
                            style={{
                                fontWeight: 700,
                                fontSize: level === 1 ? '1.2em' : level === 2 ? '1.1em' : '1em',
                                marginTop: '10px',
                                marginBottom: '6px'
                            }}
                        >
                            {applyInlineFormatting(headerText)}
                        </div>
                    );
                    i++;
                    continue;
                }

                if (line.match(/^\d+\.\s+/)) {
                    const listItems = [];
                    while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
                        const itemText = lines[i].replace(/^\d+\.\s+/, '');
                        listItems.push(
                            <li key={i}>{applyInlineFormatting(itemText)}</li>
                        );
                        i++;
                    }

                    elements.push(
                        <ol key={`ol-${i}`} style={{ paddingLeft: '20px' }}>
                            {listItems}
                        </ol>
                    );
                    continue;
                }

                if (line.match(/^[-*]\s+/)) {
                    const listItems = [];
                    while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
                        const itemText = lines[i].replace(/^[-*]\s+/, '');
                        listItems.push(
                            <li key={i}>{applyInlineFormatting(itemText)}</li>
                        );
                        i++;
                    }

                    elements.push(
                        <ul key={`ul-${i}`} style={{ paddingLeft: '20px' }}>
                            {listItems}
                        </ul>
                    );
                    continue;
                }

                if (line.trim()) {
                    elements.push(
                        <div key={i} style={{ marginBottom: '4px' }}>
                            {applyInlineFormatting(line)}
                        </div>
                    );
                }

                i++;
            }

            return elements;
        };

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {formatText(content)}
                {renderSources(sources)}
            </div>
        );
    };
    ///////////////
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Check if a chat is active. You can't upload a file to a non-existent chat.
        // if (messages.length === 0) {
        //     onSendMessage({
        //         role: 'system',
        //         content: 'Please start the conversation before uploading a file.',
        //         timestamp: new Date()
        //     });
        //     return;
        // }

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

            onSendMessage({
                role: 'system',
                content: `📄 Document "${file.name}" uploaded successfully! Now I will ALWAYS use both your document AND the knowledge base together to provide comprehensive, cross-referenced answers. Ask me anything!`,
                timestamp: new Date()
            });

        } catch (error) {
            console.error('Upload error:', error);
            onSendMessage({
                role: 'system',
                content: `❌ Failed to upload "${file.name}". Please try again.`,
                timestamp: new Date()
            });
        } finally {
            setUploadLoading(false);
        }
    };

    const handleRemoveFile = () => {
        setUploadedFile(null);
        onSendMessage({
            role: 'system',
            content: `📄 Document removed from session. Questions will now only use the knowledge base.`,
            timestamp: new Date()
        });
    };

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userInput = input;
        const userMsg = { role: 'user', content: userInput, timestamp: new Date() };

        setInput('');
        setLoading(true);
        setAnimationState('thinking');

        // This is the crucial part. We get the chatId from the first message send.
        // If it's a new chat, a new ID is created and returned by onSendMessage.
        // If it's an existing chat, the existing active ID is used and returned.
        const chatId = onSendMessage(userMsg);

        // We construct the history for the backend *before* the API call.
        // This includes the message history from props, plus the new user message.
        const historyForBackend = [...messages, userMsg];

        try {
            const formData = new FormData();
            formData.append('query', userInput);
            formData.append('use_kb', uploadedFile ? 'true' : (useKb ? 'true' : 'false'));
            formData.append('has_session_file', uploadedFile ? 'true' : 'false');

            // Pass the history, including the latest user message.
            formData.append('history', JSON.stringify(historyForBackend));

            const res = await axios.post(`${API_BASE}/chat`, formData);

            setAnimationState('response');
            const botMsg = { role: 'bot', content: res.data.answer, sources: res.data.sources || [], timestamp: new Date() };
            //
            // Use the stable chatId to send the bot's response.
            onSendMessage(botMsg, chatId);

            setTimeout(() => setAnimationState('idle'), 2000);
        } catch (e) {
            setAnimationState('idle');
            const errorMsg = { role: 'bot', content: "Failed to connect to the AI analyst. Is the backend running?", timestamp: new Date() };

            // Use the stable chatId for the error message too.
            onSendMessage(errorMsg, chatId);
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {isFullScreen && (
                        <button onClick={onNewChat} title="Start New Chat" style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer' }}>
                            <PlusSquare size={20} />
                        </button>
                    )}
                    {!isFullScreen && (
                        <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: '#6b7280', cursor: 'pointer' }}>
                            <X size={20} />
                        </button>
                    )}
                </div>

            </div>

            {/* Messages */}
            <div ref={scrollRef} style={{
                flex: 1,
                padding: isFullScreen ? '32px' : '16px',
                overflowY: messages.length === 0 ? 'hidden' : 'auto',
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
                            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                            gap: '10px',
                            maxWidth: '700px',
                            margin: '0 auto'
                        }}>
                            {[
                                { title: 'Knowledge Base', desc: 'Answers grounded in verified compliance data', icon: <Shield size={20} color="#6366f1" />, bg: '#f5f3ff' },
                                { title: 'Document Analysis', desc: 'Upload files and get instant insights', icon: <FileText size={20} color="#14b8a6" />, bg: '#f0fdfa' },
                                { title: 'Session Memory', desc: 'I remember our entire conversation', icon: <MessageSquare size={20} color="#f59e0b" />, bg: '#fffbeb' },
                                { title: 'Source Citations', desc: 'Every answer traceable to its source', icon: <Globe size={20} color="#3b82f6" />, bg: '#eff6ff' }
                            ].map((feature, i) => (
                                <div key={i} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '16px',
                                    padding: '20px',
                                    background: feature.bg,
                                    border: '1px solid #f3f4f6',
                                    borderRadius: '20px',
                                    textAlign: 'left',
                                    transition: 'transform 0.2s',
                                    cursor: 'default'
                                }}>
                                    <div style={{
                                        width: '48px',
                                        height: '48px',
                                        borderRadius: '12px',
                                        background: '#ffffff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                                        border: '1px solid #f3f4f6'
                                    }}>
                                        {feature.icon}
                                    </div>
                                    <div>
                                        <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>{feature.title}</h4>
                                        <p style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.4 }}>{feature.desc}</p>
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
                            {/* {m.content} */}
                            {m.role === 'bot'
                                ? renderMessage(m.content, m.role, m.sources)
                                : m.content}
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
            <div style={{ padding: isFullScreen ? '16px 24px' : '16px', background: '#ffffff', borderTop: '1px solid #f3f4f6' }}>
                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                />

                {/* Attached file chip */}
                {isFullScreen && uploadedFile && (
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 12px',
                        background: '#f0f9ff',
                        border: '1px solid #bae6fd',
                        borderRadius: '20px',
                        marginBottom: '10px',
                        fontSize: '13px',
                        color: '#0c4a6e'
                    }}>
                        <FileText size={14} style={{ color: '#0284c7' }} />
                        <span style={{ fontWeight: 500 }}>{uploadedFile.name}</span>
                        <span style={{ color: '#0284c7', fontSize: '11px' }}>{(uploadedFile.size / 1024).toFixed(1)} KB</span>
                        <button
                            onClick={handleRemoveFile}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                padding: '0',
                                display: 'flex',
                                alignItems: 'center',
                                marginLeft: '2px'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
                            title="Remove file"
                        >
                            <X size={14} />
                        </button>
                    </div>
                )}

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: '#f9fafb',
                    padding: isFullScreen ? '8px 12px' : '8px 12px',
                    borderRadius: '24px',
                    border: '1px solid #e5e7eb'
                }}>
                    {/* Paperclip upload button */}
                    {isFullScreen && (
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploadLoading}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: uploadLoading ? '#d1d5db' : '#6b7280',
                                cursor: uploadLoading ? 'not-allowed' : 'pointer',
                                padding: '6px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s',
                                flexShrink: 0
                            }}
                            onMouseEnter={(e) => { if (!uploadLoading) { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#111827'; } }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = uploadLoading ? '#d1d5db' : '#6b7280'; }}
                            title={uploadLoading ? 'Uploading...' : 'Attach PDF/DOCX'}
                        >
                            <Paperclip size={20} />
                        </button>
                    )}

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
                            fontSize: isFullScreen ? '16px' : '14px',
                            padding: '6px 4px'
                        }}
                    />

                    <button
                        onClick={handleSend}
                        disabled={loading || !input.trim()}
                        style={{
                            background: (loading || !input.trim()) ? '#d1d5db' : '#111827',
                            border: 'none',
                            color: 'white',
                            cursor: (loading || !input.trim()) ? 'default' : 'pointer',
                            padding: '8px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                            flexShrink: 0,
                            width: '36px',
                            height: '36px'
                        }}
                    >
                        <Send size={16} style={{ marginLeft: '1px' }} />
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
