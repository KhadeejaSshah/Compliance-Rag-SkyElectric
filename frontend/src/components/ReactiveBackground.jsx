import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

/**
 * ReactiveBackground - Animated background that reacts to chat states
 * States: 'idle' | 'typing' | 'thinking' | 'response'
 */
const ReactiveBackground = ({ state = 'idle' }) => {
    // Configuration per state
    const stateConfig = {
        idle: {
            orbCount: 6,
            speed: 20,
            scale: 1,
            colors: ['#e0e7ff', '#dbeafe', '#ede9fe', '#fce7f3'],
            blur: 80,
            opacity: 0.4
        },
        typing: {
            orbCount: 8,
            speed: 12,
            scale: 1.1,
            colors: ['#93c5fd', '#a5b4fc', '#c4b5fd', '#fbcfe8'],
            blur: 70,
            opacity: 0.5
        },
        thinking: {
            orbCount: 10,
            speed: 8,
            scale: 1.2,
            colors: ['#60a5fa', '#818cf8', '#a78bfa', '#f472b6'],
            blur: 60,
            opacity: 0.6
        },
        response: {
            orbCount: 12,
            speed: 5,
            scale: 1.4,
            colors: ['#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'],
            blur: 50,
            opacity: 0.7
        }
    };

    const config = stateConfig[state] || stateConfig.idle;

    // Generate orb positions
    const orbs = useMemo(() => {
        return Array.from({ length: 12 }, (_, i) => ({
            id: i,
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: 100 + Math.random() * 200,
            delay: Math.random() * 5,
            duration: 15 + Math.random() * 10
        }));
    }, []);

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 0,
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%)'
        }}>
            {/* Animated Orbs */}
            {orbs.slice(0, config.orbCount).map((orb) => (
                <motion.div
                    key={orb.id}
                    initial={{
                        x: `${orb.x}%`,
                        y: `${orb.y}%`,
                        scale: 0.8
                    }}
                    animate={{
                        x: [
                            `${orb.x}%`,
                            `${(orb.x + 30) % 100}%`,
                            `${(orb.x + 15) % 100}%`,
                            `${orb.x}%`
                        ],
                        y: [
                            `${orb.y}%`,
                            `${(orb.y + 20) % 100}%`,
                            `${(orb.y + 40) % 100}%`,
                            `${orb.y}%`
                        ],
                        scale: [config.scale, config.scale * 1.1, config.scale * 0.9, config.scale]
                    }}
                    transition={{
                        duration: orb.duration / config.speed * 20,
                        delay: orb.delay,
                        repeat: Infinity,
                        ease: 'easeInOut'
                    }}
                    style={{
                        position: 'absolute',
                        width: orb.size,
                        height: orb.size,
                        borderRadius: '50%',
                        background: `radial-gradient(circle, ${config.colors[orb.id % config.colors.length]} 0%, transparent 70%)`,
                        filter: `blur(${config.blur}px)`,
                        opacity: config.opacity,
                        transform: 'translate(-50%, -50%)'
                    }}
                />
            ))}

            {/* Pulse ring for thinking state */}
            {state === 'thinking' && (
                <motion.div
                    initial={{ scale: 0.5, opacity: 0.6 }}
                    animate={{
                        scale: [0.5, 1.5, 0.5],
                        opacity: [0.6, 0, 0.6]
                    }}
                    transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'easeInOut'
                    }}
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        width: 300,
                        height: 300,
                        borderRadius: '50%',
                        border: '2px solid #6366f1',
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none'
                    }}
                />
            )}

            {/* Burst effect for response state */}
            {state === 'response' && (
                <>
                    {[0, 1, 2].map((i) => (
                        <motion.div
                            key={`burst-${i}`}
                            initial={{ scale: 0, opacity: 0.8 }}
                            animate={{
                                scale: [0, 2],
                                opacity: [0.8, 0]
                            }}
                            transition={{
                                duration: 1.5,
                                delay: i * 0.3,
                                repeat: Infinity,
                                repeatDelay: 1
                            }}
                            style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                width: 200,
                                height: 200,
                                borderRadius: '50%',
                                background: 'radial-gradient(circle, rgba(99, 102, 241, 0.3) 0%, transparent 70%)',
                                transform: 'translate(-50%, -50%)',
                                pointerEvents: 'none'
                            }}
                        />
                    ))}
                </>
            )}

            {/* Subtle grid overlay */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundImage: `
                    linear-gradient(rgba(99, 102, 241, 0.03) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(99, 102, 241, 0.03) 1px, transparent 1px)
                `,
                backgroundSize: '50px 50px',
                pointerEvents: 'none'
            }} />
        </div>
    );
};

export default ReactiveBackground;
