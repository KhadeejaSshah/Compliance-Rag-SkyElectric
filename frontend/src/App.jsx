import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ChatDialog from './components/ChatDialog';
import Sidebar from './components/Sidebar';


const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

function App() {
  const [graphData, setGraphData] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessmentId, setAssessmentId] = useState(null);
  const [mode, setMode] = useState('chat'); // Simplified to chat mode
  const [useKb, setUseKb] = useState(true); // Enabled by default as requested

  // Chat History State
  const [chatHistory, setChatHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('chatHistory');
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error("Error loading chat history from localStorage", error);
      return [];
    }
  });

  const [activeChatId, setActiveChatId] = useState(() => {
    try {
      return localStorage.getItem('activeChatId') || null;
    } catch (error) {
      console.error("Error loading active chat ID from localStorage", error);
      return null;
    }
  });

  // Validate activeChatId on initial load
  useEffect(() => {
    if (activeChatId && !chatHistory.some(chat => chat.id === activeChatId)) {
      setActiveChatId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only on mount to validate initial state

  // Save chat history to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
      if (activeChatId) {
        localStorage.setItem('activeChatId', activeChatId);
      } else {
        localStorage.removeItem('activeChatId');
      }
    } catch (error) {
      console.error("Failed to save chat history to localStorage", error);
    }
  }, [chatHistory, activeChatId]);


  // Multi-session management
  useEffect(() => {
    // Generate or retrieve session ID
    let sid = sessionStorage.getItem('compliance_session_id');
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem('compliance_session_id', sid);
    }

    // Set up global axios interceptor
    const interceptor = axios.interceptors.request.use((config) => {
      config.headers['X-Session-ID'] = sid;
      return config;
    });

    // Clean up on unmount
    return () => {
      axios.interceptors.request.eject(interceptor);
    };
  }, []);

  const handleAssessmentComplete = async (assessmentId) => {
    if (!assessmentId) {
      setGraphData(null);
      setSelectedNode(null);
      setLoading(false);
      return;
    }

    setAssessmentId(assessmentId);
    try {
      const res = await axios.get(`${API_BASE}/graph/${assessmentId}`);
      setGraphData(res.data);
    } catch (e) {
      console.error("Failed to load graph", e);
    } finally {
      setLoading(false);
    }
  };

  const handleStartAnalysis = () => {
    setLoading(true);
    setGraphData(null);
    setSelectedNode(null);
    setMode('graph'); // Switch to graph mode when analysis starts
  };

  const handleNodeClick = (node) => {
    setSelectedNode(node);
  };

  const handleNewChat = () => {
    setActiveChatId(null);
  };

  const handleSelectChat = (chatId) => {
    setActiveChatId(chatId);
  };

  const handleDeleteChat = (chatId) => {
    setChatHistory(prev => prev.filter(chat => chat.id !== chatId));
    if (activeChatId === chatId) {
      setActiveChatId(null);
    }
  };

  const handleSendMessage = (message, chatId) => {
    const currentChatId = chatId || activeChatId;

    if (currentChatId) {
      setChatHistory(prev => {
        const updatedHistory = prev.map(chat =>
          chat.id === currentChatId
            ? { ...chat, messages: [...chat.messages, message] }
            : chat
        );
        const currentChat = updatedHistory.find(chat => chat.id === currentChatId);
        const otherChats = updatedHistory.filter(chat => chat.id !== currentChatId);
        // Ensure chat exists before moving it
        if (!currentChat) return prev;
        return [currentChat, ...otherChats];
      });
      return currentChatId;
    } else {
      // Create a new chat
      const newChatId = crypto.randomUUID();
      setChatHistory(prev => [{ id: newChatId, messages: [message] }, ...prev]);
      setActiveChatId(newChatId);
      return newChatId;
    }
  };

  const activeChat = chatHistory.find(chat => chat.id === activeChatId);
  const messages = activeChat?.messages || [];

  const [selectedKbIds, setSelectedKbIds] = useState([]);

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', background: '#f9fafb' }}>
      <Sidebar
        onAssessmentComplete={handleAssessmentComplete}
        selectedNode={selectedNode}
        onStartAnalysis={handleStartAnalysis}
        onNodeClick={handleNodeClick}
        assessmentId={assessmentId}
        mode={mode}
        useKb={useKb}
        selectedKbIds={selectedKbIds}
        onSelectedKbIdsChange={setSelectedKbIds}
        chatHistory={chatHistory}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
      />

      <main style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>


        <div style={{ flex: 1, position: 'relative' }}>
          <div style={{ width: '100%', height: '100%', padding: '40px', display: 'flex', justifyContent: 'center' }}>
            <ChatDialog
              isFullScreen={true}
              useKb={useKb}
              selectedKbIds={selectedKbIds}
              messages={messages}
              onSendMessage={handleSendMessage}
              onNewChat={handleNewChat}
            />
          </div>
        </div>
      </main>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .btn-primary {
          background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
          border: none;
          color: white;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          transition: transform 0.2s, opacity 0.2s;
        }
        .btn-primary:hover {
          transform: translateY(-2px);
          opacity: 0.9;
        }
        .btn-primary:active {
          transform: translateY(0);
        }
        .glass-panel {
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 12px;
        }
      `}</style>
    </div>
  );
}

export default App;
