import React, { useState } from 'react';
import axios from 'axios';
import NeuralViewport from './components/ThreeScene';
import Sidebar from './components/Sidebar';
import ChatDialog from './components/ChatDialog';
import { Layout, MessageSquare, Database } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

function App() {
  const [graphData, setGraphData] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessmentId, setAssessmentId] = useState(null);
  const [mode, setMode] = useState('graph'); // 'graph' | 'chat'
  const [useKb, setUseKb] = useState(false);

  // Ensure temporary session storage
  React.useEffect(() => {
    const handleReset = async () => {
      try {
        await axios.post(`${API_BASE}/reset`);
      } catch (e) {
        console.error("Failed to reset session:", e);
      }
    };

    // Reset on initial load to ensure a clean slate for the new session
    handleReset();

    // Reset on tab close or refresh
    const onUnload = () => {
      // Use beacon to fire assessment reset reliably
      navigator.sendBeacon(`${API_BASE}/reset`);
    };

    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
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

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', background: '#0c0c0e' }}>
      <Sidebar
        onAssessmentComplete={handleAssessmentComplete}
        onStartAnalysis={handleStartAnalysis}
        selectedNode={selectedNode}
        assessmentId={assessmentId}
        mode={mode}
        useKb={useKb}
      />

      <main style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {/* Knowledge Base Toggle (Top Left) */}
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '8px 16px',
          background: 'rgba(20, 20, 25, 0.8)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
        }}>
          <Database size={18} color={useKb ? "#a855f7" : "#fff"} style={{ opacity: useKb ? 1 : 0.5 }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '10px', fontWeight: 800, opacity: 0.5, textTransform: 'uppercase' }}>Knowledge Base</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: useKb ? '#a855f7' : '#fff' }}>
                {useKb ? "ENABLED" : "DISABLED"}
              </span>
              <button
                onClick={() => setUseKb(!useKb)}
                style={{
                  width: '36px',
                  height: '20px',
                  borderRadius: '10px',
                  background: useKb ? '#a855f7' : '#333',
                  border: 'none',
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'all 0.3s'
                }}
              >
                <div style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  background: 'white',
                  position: 'absolute',
                  top: '3px',
                  left: useKb ? '19px' : '3px',
                  transition: 'all 0.3s'
                }} />
              </button>
            </div>
          </div>
        </div>

        {/* Top Navigation Mode Switcher */}
        <div style={{
          padding: '12px 24px',
          background: 'rgba(20, 20, 25, 0.8)',
          backdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          justifyContent: 'center',
          gap: '20px',
          zIndex: 10
        }}>
          <button
            onClick={() => setMode('graph')}
            style={{
              background: mode === 'graph' ? 'rgba(168, 85, 247, 0.2)' : 'transparent',
              border: '1px solid',
              borderColor: mode === 'graph' ? '#a855f7' : 'rgba(255,255,255,0.1)',
              color: mode === 'graph' ? '#a855f7' : 'rgba(255,255,255,0.5)',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              fontWeight: 600,
              transition: 'all 0.2s'
            }}
          >
            <Layout size={18} /> GRAPH MODE
          </button>
          <button
            onClick={() => setMode('chat')}
            style={{
              background: mode === 'chat' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
              border: '1px solid',
              borderColor: mode === 'chat' ? '#6366f1' : 'rgba(255,255,255,0.1)',
              color: mode === 'chat' ? '#6366f1' : 'rgba(255,255,255,0.5)',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              fontWeight: 600,
              transition: 'all 0.2s'
            }}
          >
            <MessageSquare size={18} /> CHAT MODE
          </button>
        </div>

        <div style={{ flex: 1, position: 'relative' }}>
          {mode === 'graph' ? (
            <>
              <NeuralViewport
                graphData={graphData}
                onNodeClick={handleNodeClick}
                selectedNode={selectedNode}
                loading={loading}
              />
              {!graphData && !loading && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  opacity: 0.5,
                  pointerEvents: 'none'
                }}>
                  <h2 style={{ fontSize: '32px', marginBottom: '8px', fontWeight: 800 }}>SkyCompliance</h2>
                  <p>Accelerate your engineering workflow with AI-driven compliance intelligence.</p>
                </div>
              )}
              {/* Floating Chat in Graph Mode */}
              <ChatDialog useKb={useKb} />
            </>
          ) : (
            <div style={{ width: '100%', height: '100', padding: '40px', display: 'flex', justifyContent: 'center' }}>
              <ChatDialog isFullScreen={true} useKb={useKb} />
            </div>
          )}
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
