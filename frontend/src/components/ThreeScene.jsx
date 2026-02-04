import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Text, Float, Line, Html, useCursor } from '@react-three/drei';
import { X, CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';
import * as THREE from 'three';

// Neural background particles
const NeuralParticles = ({ count = 500 }) => {
    const mesh = useRef();
    const [positions, velocities] = useMemo(() => {
        const pos = new Float32Array(count * 3);
        const vel = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 30;
            pos[i * 3 + 1] = (Math.random() - 0.5) * 30;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 30;
            vel[i * 3] = (Math.random() - 0.5) * 0.005;
            vel[i * 3 + 1] = (Math.random() - 0.5) * 0.005;
            vel[i * 3 + 2] = (Math.random() - 0.5) * 0.005;
        }
        return [pos, vel];
    }, [count]);

    useFrame(() => {
        if (!mesh.current) return;
        const posArray = mesh.current.geometry.attributes.position.array;
        for (let i = 0; i < count; i++) {
            posArray[i * 3] += velocities[i * 3];
            posArray[i * 3 + 1] += velocities[i * 3 + 1];
            posArray[i * 3 + 2] += velocities[i * 3 + 2];
            // Wrap around
            if (Math.abs(posArray[i * 3]) > 15) velocities[i * 3] *= -1;
            if (Math.abs(posArray[i * 3 + 1]) > 15) velocities[i * 3 + 1] *= -1;
            if (Math.abs(posArray[i * 3 + 2]) > 15) velocities[i * 3 + 2] *= -1;
        }
        mesh.current.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <points ref={mesh}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={count}
                    array={positions}
                    itemSize={3}
                />
            </bufferGeometry>
            <pointsMaterial
                size={0.03}
                color="#00d4ff"
                transparent
                opacity={0.4}
                sizeAttenuation
            />
        </points>
    );
};

// Pulsing Neuron Node
const NeuronNode = ({ id, position: initialPosition, label, type, data, isSelected, onClick, onPositionChange, onDragStart, onDragEnd }) => {
    const meshRef = useRef();
    const glowRef = useRef();
    const [hovered, setHovered] = useState(false);
    const [position, setPosition] = useState(initialPosition);
    const [dragging, setDragging] = useState(false);
    const [dragStartPos, setDragStartPos] = useState(null);
    const { camera, mouse } = useThree();

    useCursor(hovered);

    // Pulsing animation
    useFrame((state) => {
        if (glowRef.current) {
            const pulse = Math.sin(state.clock.elapsedTime * 2 + id * 0.5) * 0.15 + 1;
            glowRef.current.scale.set(pulse, pulse, pulse);
        }
    });

    const handleMeshClick = (e) => {
        e.stopPropagation();
        if (!dragging) {
            onClick(data);
        }
    };

    const onPointerDown = (e) => {
        e.stopPropagation();
        setDragStartPos([mouse.x, mouse.y]);
        setDragging(true);
        onDragStart();
        document.body.style.cursor = 'grabbing';
    };

    const onPointerUp = (e) => {
        if (dragging) {
            if (dragStartPos) {
                const dragDistance = Math.sqrt(
                    Math.pow(mouse.x - dragStartPos[0], 2) +
                    Math.pow(mouse.y - dragStartPos[1], 2)
                );
                if (dragDistance < 0.01) {
                    onClick(data);
                }
            }
            setDragging(false);
            setDragStartPos(null);
            onDragEnd();
            document.body.style.cursor = 'auto';
        }
    };

    const onPointerMove = (e) => {
        if (!dragging) return;
        e.stopPropagation();
        const planeIntersectPoint = new THREE.Vector3();
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        raycaster.ray.intersectPlane(plane, planeIntersectPoint);
        const newPos = [planeIntersectPoint.x, planeIntersectPoint.y, 0];
        setPosition(newPos);
        onPositionChange(id, newPos);
    };

    useEffect(() => {
        if (dragging) {
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
        }
        return () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        };
    }, [dragging, onPointerMove, onPointerUp]);

    useEffect(() => {
        setPosition(initialPosition);
    }, [initialPosition]);

    // Neuron color palette: cyan, electric blue, purple
    const color = useMemo(() => {
        if (type === 'regulation') return '#00d4ff'; // Cyan for standards
        if (data?.status === 'COMPLIANT') return '#00ff9d'; // Electric green
        if (data?.status === 'PARTIAL') return '#ffaa00'; // Amber
        return '#ff3366'; // Hot pink for non-compliant
    }, [type, data]);

    return (
        <group position={position}>
            {/* Outer glow (pulsing) */}
            <mesh ref={glowRef} scale={[1.5, 1.5, 1.5]}>
                <sphereGeometry args={[type === 'regulation' ? 0.18 : 0.1, 32, 32]} />
                <meshStandardMaterial
                    color={color}
                    transparent
                    opacity={0.15}
                    side={THREE.BackSide}
                    emissive={color}
                    emissiveIntensity={1.5}
                />
            </mesh>

            {/* Core neuron body */}
            <mesh
                ref={meshRef}
                onPointerOver={() => setHovered(true)}
                onPointerOut={() => setHovered(false)}
                onPointerDown={onPointerDown}
                onClick={handleMeshClick}
            >
                <sphereGeometry args={[type === 'regulation' ? 0.15 : 0.08, 32, 32]} />
                <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={hovered || isSelected ? 3 : 1}
                    metalness={0.8}
                    roughness={0.2}
                    toneMapped={false}
                />
            </mesh>

            {/* Dendrite spikes for regulation nodes */}
            {type === 'regulation' && (
                <>
                    {[0, 1, 2, 3, 4, 5].map((i) => {
                        const angle = (i / 6) * Math.PI * 2;
                        const x = Math.cos(angle) * 0.25;
                        const y = Math.sin(angle) * 0.25;
                        return (
                            <mesh key={i} position={[x, y, 0]} rotation={[0, 0, angle]}>
                                <coneGeometry args={[0.02, 0.1, 4]} />
                                <meshStandardMaterial
                                    color={color}
                                    emissive={color}
                                    emissiveIntensity={0.5}
                                    transparent
                                    opacity={0.7}
                                />
                            </mesh>
                        );
                    })}
                </>
            )}

            {isSelected && (
                <Html distanceFactor={10} position={[0.5, 0.5, 0]} zIndexRange={[100, 0]}>
                    <div className="glass-panel" style={{
                        width: '300px',
                        padding: '16px',
                        fontSize: '12px',
                        color: 'white',
                        boxShadow: `0 10px 40px rgba(0,0,0,0.5), 0 0 20px ${color}44`,
                        border: `1px solid ${color}`,
                        backdropFilter: 'blur(20px)',
                        background: 'rgba(10, 15, 25, 0.9)',
                        borderRadius: '12px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontWeight: 'bold', color }}>
                                {type === 'regulation' ? `Standard ${data.label}` : `Requirement ${data.label}`}
                            </span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    onClick(null);
                                }}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'white',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                            >
                                <X size={14} />
                            </button>
                        </div>
                        <p style={{ margin: 0, opacity: 0.9, lineHeight: 1.5 }}>{data.reasoning || data.text}</p>
                        {data.evidence && data.evidence !== 'N/A' && (
                            <div style={{ marginTop: '10px', padding: '8px', background: `${color}11`, borderLeft: `2px solid ${color}`, borderRadius: '4px' }}>
                                <span style={{ fontSize: '10px', opacity: 0.5, letterSpacing: '1px' }}>EVIDENCE:</span>
                                <p style={{ margin: 0, fontStyle: 'italic', marginTop: '4px' }}>"{data.evidence}"</p>
                            </div>
                        )}
                    </div>
                </Html>
            )}

            {hovered && !isSelected && (
                <Html distanceFactor={8} position={[0.8, 0, 0]} zIndexRange={[1000, 0]}>
                    <div style={{
                        background: 'rgba(10, 15, 25, 0.95)',
                        border: `2px solid ${color}`,
                        borderRadius: '10px',
                        padding: '10px 14px',
                        color: 'white',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        whiteSpace: 'nowrap',
                        backdropFilter: 'blur(10px)',
                        boxShadow: `0 4px 20px rgba(0,0,0,0.7), 0 0 15px ${color}33`,
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none',
                        letterSpacing: '0.5px'
                    }}>
                        <div style={{
                            background: `linear-gradient(90deg, ${color}44, transparent)`,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            marginBottom: '6px'
                        }}>
                            {type === 'regulation' ? '🧠 STANDARD' : '⚡ REQUIREMENT'}
                        </div>
                        <div style={{ fontSize: '10px', opacity: 0.9 }}>
                            DOC #{data.doc_id || '?'} | PAGE {data.page || '?'} | {data.label || '?'}
                        </div>
                        {data.status && (
                            <div style={{
                                fontSize: '9px',
                                marginTop: '4px',
                                padding: '2px 6px',
                                background: color + '22',
                                borderRadius: '4px'
                            }}>
                                STATUS: {data.status}
                            </div>
                        )}
                    </div>
                </Html>
            )}
        </group>
    );
};

// Neural synapse connection with flow animation
const Synapse = ({ start, end, status }) => {
    const lineRef = useRef();
    const flowRef = useRef();

    const color = status === 'COMPLIANT' ? '#00ff9d' : status === 'PARTIAL' ? '#ffaa00' : '#ff3366';

    const points = useMemo(() => [
        new THREE.Vector3(...start),
        new THREE.Vector3(...end)
    ], [start, end]);

    // Flow particle animation along the synapse
    useFrame((state) => {
        if (flowRef.current) {
            const t = (Math.sin(state.clock.elapsedTime * 2) + 1) / 2;
            const pos = new THREE.Vector3().lerpVectors(points[0], points[1], t);
            flowRef.current.position.copy(pos);
        }
    });

    return (
        <group>
            <Line
                ref={lineRef}
                points={points}
                color={color}
                lineWidth={2}
                transparent
                opacity={0.5}
            />
            {/* Flow particle */}
            <mesh ref={flowRef}>
                <sphereGeometry args={[0.02, 8, 8]} />
                <meshBasicMaterial color={color} transparent opacity={0.8} />
            </mesh>
        </group>
    );
};

const ThreeScene = ({ graphData: data, onNodeClick, selectedNode, loading }) => {
    const [nodePositions, setNodePositions] = useState({});
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        if (!data) return;
        const initialPositions = {};
        data.nodes.forEach((node, idx) => {
            if (node.type === 'regulation') {
                const angle = (idx / data.nodes.filter(n => n.type === 'regulation').length) * Math.PI * 2;
                initialPositions[node.id] = [Math.cos(angle) * 2.5, Math.sin(angle) * 2.5, 0];
            } else {
                initialPositions[node.id] = [(Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 0];
            }
        });
        setNodePositions(initialPositions);
    }, [data]);

    const handlePositionChange = (id, pos) => {
        setNodePositions(prev => ({ ...prev, [id]: pos }));
    };

    if (loading) {
        return (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#060a10' }}>
                <div className="spinner" style={{ width: '60px', height: '60px', border: '4px solid rgba(0,212,255,0.1)', borderTopColor: '#00d4ff', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <h2 style={{ marginTop: '24px', letterSpacing: '4px', background: 'linear-gradient(to right, #00d4ff, #00ff9d)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 800 }}>
                    ANALYZING NEURAL NETWORK...
                </h2>
                <style jsx="true">{`
                    @keyframes spin { to { transform: rotate(360deg); } }
                `}</style>
            </div>
        );
    }

    return (
        <Canvas camera={{ position: [0, 0, 6], fov: 60 }}>
            <color attach="background" args={['#060a10']} />
            <ambientLight intensity={0.3} />
            <pointLight position={[10, 10, 10]} intensity={0.8} color="#00d4ff" />
            <pointLight position={[-10, -10, -10]} intensity={0.5} color="#00ff9d" />

            <NeuralParticles count={400} />

            <OrbitControls
                enablePan={true}
                enableZoom={true}
                makeDefault
                enabled={!isDragging}
            />

            {data?.nodes?.length > 0 && Object.keys(nodePositions).length > 0 && data.nodes.map((node) => (
                <NeuronNode
                    key={node.id}
                    id={node.id}
                    position={nodePositions[node.id] || [0, 0, 0]}
                    label={node.label}
                    type={node.type}
                    data={node}
                    isSelected={selectedNode?.id === node.id}
                    onClick={(nodeData) => onNodeClick(nodeData)}
                    onPositionChange={handlePositionChange}
                    onDragStart={() => setIsDragging(true)}
                    onDragEnd={() => setIsDragging(false)}
                />
            ))}

            {data && Object.keys(nodePositions).length > 0 && data.edges.map((edge, idx) => (
                <Synapse
                    key={idx}
                    start={nodePositions[edge.from]}
                    end={nodePositions[edge.to]}
                    status={edge.status}
                />
            ))}
        </Canvas>
    );
};

const NeuralViewport = ({ graphData, onNodeClick, selectedNode, loading }) => {
    return (
        <div style={{ width: '100%', height: '100vh', background: 'radial-gradient(circle at center, #0a1525 0%, #060a10 100%)' }}>
            <ThreeScene
                graphData={graphData}
                onNodeClick={onNodeClick}
                selectedNode={selectedNode}
                loading={loading}
            />
        </div>
    );
};

export default NeuralViewport;
