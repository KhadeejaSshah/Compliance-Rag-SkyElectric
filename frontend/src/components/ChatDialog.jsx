import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X, Bot, User, Maximize2, Minimize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

const ChatDialog = ({ isFullScreen = false, useKb = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef();

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const formData = new FormData();
            formData.append('query', input);
            formData.append('use_kb', useKb);
            const res = await axios.post(`${API_BASE}/chat`, formData);

            setMessages(prev => [...prev, { role: 'bot', content: res.data.answer }]);
        } catch (e) {
            setMessages(prev => [...prev, { role: 'bot', content: "Failed to connect to the AI analyst. Is the backend running?" }]);
        } finally {
            setLoading(false);
        }
    };

    const containerStyle = isFullScreen ? {
        width: '100%',
        maxWidth: '1000px',
        height: '100%',
        maxHeight: '800px',
        background: 'rgba(20, 20, 25, 0.95)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '24px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
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
                background: 'rgba(255,255,255,0.05)',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
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
                    <span style={{ fontWeight: 'bold', fontSize: isFullScreen ? '18px' : '14px' }}>
                        SkyCompliance AI Analyst
                    </span>
                </div>
                {!isFullScreen && (
                    <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: 'white', opacity: 0.5, cursor: 'pointer' }}>
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
                    <div style={{ opacity: 0.4, textAlign: 'center', marginTop: isFullScreen ? '100px' : '40px' }}>
                        <Bot size={isFullScreen ? 64 : 40} style={{ margin: '0 auto 16px', color: '#6366f1' }} />
                        <h3 style={{ fontSize: isFullScreen ? '24px' : '18px', marginBottom: '8px' }}>SkyCompliance™ Intelligent Chat</h3>
                        <p style={{ fontSize: isFullScreen ? '16px' : '14px' }}>
                            Ask questions regarding your uploaded PDFs and DOCX files.<br />
                            I can automatically translate and summarize documents in multiple languages.
                        </p>
                    </div>
                )}
                {messages.map((m, idx) => (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={idx}
                        style={{
                            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                            maxWidth: '85%',
                            padding: isFullScreen ? '16px 20px' : '10px 14px',
                            borderRadius: m.role === 'user' ? '16px 16px 0 16px' : '16px 16px 16px 0',
                            background: m.role === 'user' ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' : 'rgba(255,255,255,0.08)',
                            color: 'white',
                            fontSize: isFullScreen ? '16px' : '14px',
                            lineHeight: 1.6,
                            boxShadow: m.role === 'user' ? '0 4px 12px rgba(99, 102, 241, 0.3)' : 'none'
                        }}
                    >
                        {m.content}
                    </motion.div>
                ))}
                {loading && (
                    <div style={{ alignSelf: 'flex-start', padding: '12px 18px', borderRadius: '16px 16px 16px 0', background: 'rgba(255,255,255,0.08)' }}>
                        <div className="dot-flashing"></div>
                    </div>
                )}
            </div>

            {/* Input */}
            <div style={{ padding: isFullScreen ? '32px' : '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{
                    display: 'flex',
                    gap: '12px',
                    background: 'rgba(255,255,255,0.05)',
                    padding: isFullScreen ? '12px 20px' : '10px 14px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.1)'
                }}>
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Type your question here... (Multilingual supported)"
                        style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            color: 'white',
                            outline: 'none',
                            fontSize: isFullScreen ? '16px' : '14px'
                        }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={loading}
                        style={{
                            background: '#6366f1',
                            border: 'none',
                            color: 'white',
                            cursor: 'pointer',
                            opacity: loading ? 0.5 : 1,
                            padding: '8px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <Send size={isFullScreen ? 20 : 18} />
                    </button>
                </div>
                {isFullScreen && (
                    <p style={{ marginTop: '12px', fontSize: '12px', opacity: 0.4, textAlign: 'center' }}>
                        I use RAG to analyze your specific documents. All answers are based on the knowledge base you've uploaded.
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
        return chatContent;
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
