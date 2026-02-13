import React from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';

const ChatHistory = ({ history, activeChatId, onSelectChat, onDeleteChat, onNewChat }) => {
    // Sort history in descending order based on the timestamp of the last message
    const sortedHistory = [...history].sort((a, b) => {
        const lastMessageA = a.messages[a.messages.length - 1];
        const lastMessageB = b.messages[b.messages.length - 1];
        return new Date(lastMessageB?.timestamp || 0) - new Date(lastMessageA?.timestamp || 0);
    });

    return (
        <section style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', textTransform: 'uppercase', color: '#374151' }}>
                    <MessageSquare size={16} /> Chat History
                </h3>
                <button
                    onClick={onNewChat}
                    style={{
                        padding: '4px 10px',
                        background: '#f3f4f6',
                        border: '1px solid #e5e7eb',
                        color: '#374151',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px'
                    }}
                >
                    New Chat
                </button>
            </div>
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                {sortedHistory.map(chat => {
                    const firstUserMessage = chat.messages.find(m => m.role === 'user');
                    const title = firstUserMessage ? firstUserMessage.content : 'New Chat';
                    const isActive = chat.id === activeChatId;

                    return (
                        <div
                            key={chat.id}
                            onClick={() => onSelectChat(chat.id)}
                            style={{
                                padding: '12px',
                                borderRadius: '8px',
                                background: isActive ? '#ede9fe' : '#f9fafb',
                                border: `1px solid ${isActive ? '#c4b5fd' : '#f3f4f6'}`,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '8px',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <p style={{
                                margin: 0,
                                fontSize: '14px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                color: isActive ? '#4c1d95' : '#374151'
                            }}>
                                {title}
                            </p>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteChat(chat.id);
                                }}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#ef4444',
                                    opacity: 0.5,
                                    cursor: 'pointer',
                                    padding: '4px'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                                onMouseLeave={(e) => e.currentTarget.style.opacity = 0.5}
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </section>
    );
};

export default ChatHistory;
