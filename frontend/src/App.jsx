import React, { useState } from 'react';
import axios from 'axios';
import ThreeScene from './components/ThreeScene';
import Sidebar from './components/Sidebar';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

function App() {
  const [graphData, setGraphData] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessmentId, setAssessmentId] = useState(null);

  const handleAssessmentComplete = async (assessmentId) => {
    if (!assessmentId) {
      setGraphData(null);
      setSelectedNode(null);
      setLoading(false); // Ensure loading stops
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
    setGraphData(null); // Clear old graph to show spinner properly
    setSelectedNode(null);
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
      />

      <main style={{ flex: 1, position: 'relative' }}>
        <ThreeScene
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
            <h2 style={{ fontSize: '32px', marginBottom: '8px' }}>Compliance Galaxy</h2>
            <p>Upload documents and run analysis to visualize compliance relationships.</p>
          </div>
        )}
      </main>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default App;
