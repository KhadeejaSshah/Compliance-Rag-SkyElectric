import React from 'react';
import { Clock } from 'lucide-react';

const ChatHistory = ({ history, onLoadHistory }) => {
    if (!history || history.length === 0) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>
                <Clock size={32} style={{ margin: '0 auto 10px' }} />
                No chat history yet.
            </div>
        );
    }

    return (
        <div style={{ padding: '20px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', textTransform: 'uppercase', opacity: 0.6, marginBottom: '20px' }}>
                <Clock size={16} /> Chat History
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {history.map((chat, index) => (
                    <li key={index} onClick={() => onLoadHistory(chat, index)} style={{
                        padding: '12px',
                        borderRadius: '8px',
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid transparent',
                        cursor: 'pointer',
                        marginBottom: '10px',
                        transition: 'all 0.2s ease'
                    }}>
                        <div style={{ fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {chat[0]?.content || 'Empty Chat'}
                        </div>
                        <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '4px' }}>
                            {chat.length} messages
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default ChatHistory;
