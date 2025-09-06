'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { appConfig } from '@/config/app.config';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
// Import icons from centralized module to avoid Turbopack chunk issues
import {
    FiFile,
    SiJavascript,
    SiReact,
    SiCss3,
    SiJson
} from '@/lib/icons';
import { motion, AnimatePresence } from 'framer-motion';
import CodeApplicationProgress, { type CodeApplicationState } from '@/components/CodeApplicationProgress';
import { useQueryState } from 'nuqs';
import Image from 'next/image';
import { CardStorage } from '@/lib/card-storage';
import { Card } from '@/types/card';
import posthog from 'posthog-js';

interface SandboxData {
    sandboxId: string;
    url: string;
    [key: string]: any;
}

// Animated score counter component with ease-out animation
const AnimatedScore: React.FC<{ targetScore: number; duration?: number }> = ({
    targetScore,
    duration = 3000
}) => {
    const [currentScore, setCurrentScore] = useState(0);
    const [hasAnimated, setHasAnimated] = useState(false);

    useEffect(() => {
        if (targetScore > 0 && !hasAnimated) {
            setHasAnimated(true);
            const startTime = Date.now();
            const startScore = 0;

            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Ease-out function: starts fast, slows down
                const easeOutProgress = 1 - Math.pow(1 - progress, 4);

                const currentValue = Math.floor(startScore + (targetScore - startScore) * easeOutProgress);
                setCurrentScore(currentValue);

                if (progress < 1) {
                    requestAnimationFrame(animate);
                }
            };

            requestAnimationFrame(animate);
        }
    }, [targetScore, duration, hasAnimated]);

    return <span>{currentScore}/100</span>;
};

interface ChatMessage {
    content: string;
    type: 'user' | 'ai' | 'system' | 'file-update' | 'command' | 'error';
    timestamp: Date;
    metadata?: {
        generatedCode?: string;
        appliedFiles?: string[];
        commandType?: 'input' | 'output' | 'error' | 'success';
    };
}

const GAME_TIPS = [
    'Be specific about colors and shapes',
    'Describe the mood you want',
    'Start simple, add details later',
    'Use everyday words, not tech terms',
    'Think buttons, cards, and layouts',
    'Mention specific UI elements you need',
    'Describe spacing and alignment',
    'Try to recreate the target image as closely as possible'
]

const MAX_PROMPT_COUNT = 3;

export default function SandboxPage() {
    const [sandboxData, setSandboxData] = useState<SandboxData | null>(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState({ text: 'Not connected', active: false });
    const [responseArea, setResponseArea] = useState<string[]>([]);
    const [structureContent, setStructureContent] = useState('No sandbox created yet');
    const [promptInput, setPromptInput] = useState('');
    const [currentTipIndex, setCurrentTipIndex] = useState(0);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
        {
            content: 'Welcome  to the GDGoC Prompting Challenge! Create the duplication of the selected image in 5 prompt or less and let AI decide how similar it is to the original image.',
            type: 'system',
            timestamp: new Date()
        }
    ]);
    const [aiChatInput, setAiChatInput] = useState('');
    const [aiEnabled] = useState(true);
    const searchParams = useSearchParams();
    const router = useRouter();
    const [promptCount, setPromptCount] = useState(MAX_PROMPT_COUNT);
    const [aiModel] = useState('google/gemini-2.5-flash');
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'generation' | 'preview'>('preview');
    const [showLoadingBackground, setShowLoadingBackground] = useState(false);
    const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
    const [loadingStage, setLoadingStage] = useState<'gathering' | 'planning' | 'generating' | "judging" | null>(null);
    const [challengeCompleted, setChallengeCompleted] = useState(false);
    const [similarityScore, setSimilarityScore] = useState<number | null>(null);

    const [selectedCardId, setSelectedCardId] = useQueryState('selectedImage')
    const [username, setUsername] = useQueryState('username')

    const [previousCard, setPreviousCard] = useState<Card | null>(null);
    const [judgingStatus, setJudgingStatus] = useState<'submitting' | 'grading' | 'completed-bridging' | 'completed-first-own' | 'completed-higher-score' | 'completed-lower-score' | 'failed' | null>(null);
    

    const [conversationContext, setConversationContext] = useState<{
        scrapedWebsites: Array<{ url: string; content: any; timestamp: Date }>;
        generatedComponents: Array<{ name: string; path: string; content: string }>;
        appliedCode: Array<{ files: string[]; timestamp: Date }>;
        currentProject: string;
        lastGeneratedCode?: string;
    }>({
        scrapedWebsites: [],
        generatedComponents: [],
        appliedCode: [],
        currentProject: 'Sandbox Project',
        lastGeneratedCode: undefined
    });

    const iframeRef = useRef<HTMLIFrameElement>(null);
    const chatMessagesRef = useRef<HTMLDivElement>(null);
    const codeDisplayRef = useRef<HTMLDivElement>(null);

    const [codeApplicationState, setCodeApplicationState] = useState<CodeApplicationState>({
        stage: null
    });

    const [backgroundMusic, setBackgroundMusic] = useState<HTMLAudioElement | null>(null);

    // Initialize background music
    useEffect(() => {
        const audio = new Audio('/audio/background-music.mp3'); // You'll need to add this audio file
        audio.loop = true;
        audio.volume = 0.3; // Set volume to 30%
        setBackgroundMusic(audio);

        // Cleanup on unmount
        return () => {
            if (audio) {
                audio.pause();
                audio.src = '';
            }
        };
    }, []);

    // Cycle through game tips
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTipIndex((prevIndex) => (prevIndex + 1) % GAME_TIPS.length);
        }, 3000); // Change tip every 3 seconds

        return () => clearInterval(interval);
    }, []);

    // Play background music when user starts interacting
    useEffect(() => {
        if (backgroundMusic && (chatMessages.length > 1 || generationProgress.isGenerating)) {
            const playMusic = () => {
                backgroundMusic.play().catch(error => {
                    console.log('Audio autoplay blocked:', error);
                });
            };

            // Try to play immediately
            playMusic();

            // Also add a click listener to ensure music plays on user interaction
            const handleUserInteraction = () => {
                playMusic();
                document.removeEventListener('click', handleUserInteraction);
            };

            document.addEventListener('click', handleUserInteraction);

            return () => {
                document.removeEventListener('click', handleUserInteraction);
            };
        }
    }, [backgroundMusic, chatMessages.length]);

    const [generatedImage, setGeneratedImage] = useState<string | null>(null);


    const [generationProgress, setGenerationProgress] = useState<{
        isGenerating: boolean;
        status: string;
        components: Array<{ name: string; path: string; completed: boolean }>;
        currentComponent: number;
        streamedCode: string;
        isStreaming: boolean;
        isThinking: boolean;
        thinkingText?: string;
        thinkingDuration?: number;
        currentFile?: { path: string; content: string; type: string };
        files: Array<{ path: string; content: string; type: string; completed: boolean; edited?: boolean }>;
        lastProcessedPosition: number;
        isEdit?: boolean;
    }>({
        isGenerating: false,
        status: '',
        components: [],
        currentComponent: 0,
        streamedCode: '',
        isStreaming: false,
        isThinking: false,
        files: [],
        lastProcessedPosition: 0
    });

    // Clear old conversation data on component mount and create/restore sandbox
    useEffect(() => {
        let isMounted = true;

        const initializePage = async () => {
            // Clear old conversation
            try {
                await fetch('/api/conversation-state', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'clear-old' })
                });
                console.log('[sandbox] Cleared old conversation data on mount');
            } catch (error) {
                console.error('[sandbox] Failed to clear old conversation:', error);
                if (isMounted) {
                    addChatMessage('Failed to clear old conversation data.', 'error');
                }
            }

            if (!isMounted) return;

            // Check if sandbox ID is in URL
            const sandboxIdParam = searchParams.get('sandbox');

            setLoading(true);
            try {
                if (sandboxIdParam) {
                    console.log('[sandbox] Attempting to restore sandbox:', sandboxIdParam);
                    // For now, just create a new sandbox - you could enhance this to actually restore
                    // the specific sandbox if your backend supports it
                    await createSandbox(true);
                } else {
                    console.log('[sandbox] No sandbox in URL, creating new sandbox automatically...');
                    await createSandbox(true);
                }
            } catch (error) {
                console.error('[sandbox] Failed to create or restore sandbox:', error);
                if (isMounted) {
                    addChatMessage('Failed to create or restore sandbox.', 'error');
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        initializePage();

        return () => {
            isMounted = false;
        };
    }, []); // Run only on mount

    useEffect(() => {
        if (chatMessagesRef.current) {
            chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
        }
    }, [chatMessages]);

    const updateStatus = (text: string, active: boolean) => {
        setStatus({ text, active });
    };

    const log = (message: string, type: 'info' | 'error' | 'command' = 'info') => {
        setResponseArea(prev => [...prev, `[${type}] ${message}`]);
    };

    const addChatMessage = (content: string, type: ChatMessage['type'], metadata?: ChatMessage['metadata']) => {
        setChatMessages(prev => {
            // Skip duplicate consecutive system messages
            if (type === 'system' && prev.length > 0) {
                const lastMessage = prev[prev.length - 1];
                if (lastMessage.type === 'system' && lastMessage.content === content) {
                    return prev; // Skip duplicate
                }
            }
            return [...prev, { content, type, timestamp: new Date(), metadata }];
        });
    };

    const createSandbox = async (fromHomeScreen = false) => {
        console.log('[createSandbox] Starting sandbox creation...');
        setLoading(true);
        setShowLoadingBackground(true);
        updateStatus('Creating sandbox...', false);
        setResponseArea([]);

        try {
            const response = await fetch('/api/create-ai-sandbox', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            const data = await response.json();
            console.log('[createSandbox] Response data:', data);

            if (data.success) {
                setSandboxData(data);
                updateStatus('Sandbox active', true);
                log('Sandbox created successfully!');
                log(`Sandbox ID: ${data.sandboxId}`);
                log(`URL: ${data.url}`);

                // Update URL with sandbox ID
                const newParams = new URLSearchParams(searchParams.toString());
                newParams.set('sandbox', data.sandboxId);
                router.push(`/sandbox?${newParams.toString()}`, { scroll: false });

                // Fade out loading background after sandbox loads
                setTimeout(() => {
                    setShowLoadingBackground(false);
                }, 3000);

                if (data.structure) {
                    displayStructure(data.structure);
                }

                // Restart Vite server to ensure it's running
                setTimeout(async () => {
                    try {
                        console.log('[createSandbox] Ensuring Vite server is running...');
                        const restartResponse = await fetch('/api/restart-vite', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                        });

                        if (restartResponse.ok) {
                            const restartData = await restartResponse.json();
                            if (restartData.success) {
                                console.log('[createSandbox] Vite server started successfully');
                            }
                        }
                    } catch (error) {
                        console.error('[createSandbox] Error starting Vite server:', error);
                    }
                }, 2000);

                // Only add welcome message if not coming from home screen
                if (!fromHomeScreen) {
                    addChatMessage(`Sandbox created! ID: ${data.sandboxId}. I now have context of your sandbox and can help you build your app. Just ask me to create components and I'll automatically apply them!

Tip: I automatically detect and install npm packages from your code imports (like react-router-dom, axios, etc.)`, 'system');
                }

                setTimeout(() => {
                    if (iframeRef.current) {
                        iframeRef.current.src = data.url;
                    }
                }, 100);
            } else {
                throw new Error(data.error || 'Unknown error');
            }
        } catch (error: any) {
            console.error('[createSandbox] Error:', error);
            updateStatus('Error', false);
            log(`Failed to create sandbox: ${error.message}`, 'error');
            addChatMessage(`Failed to create sandbox: ${error.message}`, 'system');
        } finally {
            setLoading(false);
        }
    };

    const displayStructure = (structure: any) => {
        if (typeof structure === 'object') {
            setStructureContent(JSON.stringify(structure, null, 2));
        } else {
            setStructureContent(structure || 'No structure available');
        }
    };

    const applyGeneratedCode = async (code: string, isEdit: boolean = false) => {
        setLoading(true);
        log('Applying AI-generated code...');

        try {
            // Show progress component instead of individual messages
            setCodeApplicationState({ stage: 'analyzing' });

            // Get pending packages from tool calls
            const pendingPackages = ((window as any).pendingPackages || []).filter((pkg: any) => pkg && typeof pkg === 'string');
            if (pendingPackages.length > 0) {
                console.log('[applyGeneratedCode] Sending packages from tool calls:', pendingPackages);
                // Clear pending packages after use
                (window as any).pendingPackages = [];
            }

            // Use streaming endpoint for real-time feedback
            const response = await fetch('/api/apply-ai-code-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    response: code,
                    isEdit: isEdit,
                    packages: pendingPackages,
                    sandboxId: sandboxData?.sandboxId // Pass the sandbox ID to ensure proper connection
                })
            });

            if (!response.ok) {
                throw new Error(`Failed to apply code: ${response.statusText}`);
            }

            // Handle streaming response
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let finalData: any = null;

            while (reader) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));

                            switch (data.type) {
                                case 'start':
                                    // Don't add as chat message, just update state
                                    setCodeApplicationState({ stage: 'analyzing' });
                                    break;

                                case 'step':
                                    // Update progress state based on step
                                    if (data.message.includes('Installing') && data.packages) {
                                        setCodeApplicationState({
                                            stage: 'installing',
                                            packages: data.packages
                                        });
                                    } else if (data.message.includes('Creating files') || data.message.includes('Applying')) {
                                        setCodeApplicationState({
                                            stage: 'applying',
                                            filesGenerated: data.results?.filesCreated || []
                                        });
                                    }
                                    break;

                                case 'package-progress':
                                    // Handle package installation progress
                                    if (data.installedPackages) {
                                        setCodeApplicationState(prev => ({
                                            ...prev,
                                            installedPackages: data.installedPackages
                                        }));
                                    }
                                    break;

                                case 'success':
                                    if (data.installedPackages) {
                                        setCodeApplicationState(prev => ({
                                            ...prev,
                                            installedPackages: data.installedPackages
                                        }));
                                    }
                                    break;

                                case 'file-progress':
                                    // Skip file progress messages, they're noisy
                                    break;

                                case 'file-complete':
                                    // Could add individual file completion messages if desired
                                    break;

                                case 'command':
                                    // Don't show npm install commands - they're handled by info messages
                                    if (data.command && !data.command.includes('npm install')) {
                                        addChatMessage(data.command, 'command', { commandType: 'input' });
                                    }
                                    break;

                                case 'command-progress':
                                    addChatMessage(`${data.action} command: ${data.command}`, 'command', { commandType: 'input' });
                                    break;

                                case 'command-output':
                                    addChatMessage(data.output, 'command', {
                                        commandType: data.stream === 'stderr' ? 'error' : 'output'
                                    });
                                    break;

                                case 'command-complete':
                                    if (data.success) {
                                        addChatMessage(`Command completed successfully`, 'system');
                                    } else {
                                        addChatMessage(`Command failed with exit code ${data.exitCode}`, 'system');
                                    }
                                    break;

                                case 'complete':
                                    finalData = data;
                                    setCodeApplicationState({ stage: 'complete' });
                                    // Clear the state after a delay
                                    setTimeout(() => {
                                        setCodeApplicationState({ stage: null });
                                    }, 3000);
                                    break;

                                case 'error':
                                    addChatMessage(`Error: ${data.message || data.error || 'Unknown error'}`, 'system');
                                    break;

                                case 'warning':
                                    addChatMessage(`${data.message}`, 'system');
                                    break;

                                case 'info':
                                    // Show info messages, especially for package installation
                                    if (data.message) {
                                        addChatMessage(data.message, 'system');
                                    }
                                    break;
                            }
                        } catch (e) {
                            // Ignore parse errors
                        }
                    }
                }
            }

            // Process final data
            if (finalData && finalData.type === 'complete') {
                const data = {
                    success: true,
                    results: finalData.results,
                    explanation: finalData.explanation,
                    structure: finalData.structure,
                    message: finalData.message
                };

                if (data.success) {
                    const { results } = data;

                    // Log package installation results without duplicate messages
                    if (results.packagesInstalled?.length > 0) {
                        log(`Packages installed: ${results.packagesInstalled.join(', ')}`);
                    }

                    if (results.filesCreated?.length > 0) {
                        log('Files created:');
                        results.filesCreated.forEach((file: string) => {
                            log(`  ${file}`, 'command');
                        });

                        // Verify files were actually created by refreshing the sandbox if needed
                        if (sandboxData?.sandboxId && results.filesCreated.length > 0) {
                            // Small delay to ensure files are written
                            setTimeout(() => {
                                // Force refresh the iframe to show new files
                                if (iframeRef.current) {
                                    iframeRef.current.src = iframeRef.current.src;
                                }
                            }, 1000);
                        }
                    }

                    if (results.filesUpdated?.length > 0) {
                        log('Files updated:');
                        results.filesUpdated.forEach((file: string) => {
                            log(`  ${file}`, 'command');
                        });
                    }

                    // Update conversation context with applied code
                    setConversationContext(prev => ({
                        ...prev,
                        appliedCode: [...prev.appliedCode, {
                            files: [...(results.filesCreated || []), ...(results.filesUpdated || [])],
                            timestamp: new Date()
                        }]
                    }));

                    if (results.commandsExecuted?.length > 0) {
                        log('Commands executed:');
                        results.commandsExecuted.forEach((cmd: string) => {
                            log(`  $ ${cmd}`, 'command');
                        });
                    }

                    if (results.errors?.length > 0) {
                        results.errors.forEach((err: string) => {
                            log(err, 'error');
                        });
                    }

                    if (data.structure) {
                        displayStructure(data.structure);
                    }

                    if (data.explanation) {
                        log(data.explanation);
                    }

                    log('Code applied successfully!');
                    console.log('[applyGeneratedCode] Response data:', data);

                    if (results.filesCreated?.length > 0) {
                        setConversationContext(prev => ({
                            ...prev,
                            appliedCode: [...prev.appliedCode, {
                                files: results.filesCreated,
                                timestamp: new Date()
                            }]
                        }));

                        // Update the chat message to show success
                        // Only show file list if not in edit mode
                        if (isEdit) {
                            addChatMessage(`Edit applied successfully!`, 'system');
                        } else {
                            // Check if this is part of a generation flow (has recent AI recreation message)
                            const recentMessages = chatMessages.slice(-5);
                            const isPartOfGeneration = recentMessages.some(m =>
                                m.content.includes('AI recreation generated') ||
                                m.content.includes('Code generated')
                            );

                            // Don't show files if part of generation flow to avoid duplication
                            if (isPartOfGeneration) {
                                addChatMessage(`Applied ${results.filesCreated.length} files successfully!`, 'system');
                            } else {
                                addChatMessage(`Applied ${results.filesCreated.length} files successfully!`, 'system', {
                                    appliedFiles: results.filesCreated
                                });
                            }
                        }

                        // If there are failed packages, add a message about checking for errors
                        if (results.packagesFailed?.length > 0) {
                            addChatMessage(`⚠️ Some packages failed to install. Check the error banner above for details.`, 'system');
                        }

                        // Force iframe refresh after applying code
                        const refreshDelay = appConfig.codeApplication.defaultRefreshDelay; // Allow Vite to process changes

                        setTimeout(() => {
                            if (iframeRef.current && sandboxData?.url) {
                                console.log('[sandbox] Refreshing iframe after code application...');

                                // Method 1: Change src with timestamp
                                const urlWithTimestamp = `${sandboxData.url}?t=${Date.now()}&applied=true`;
                                iframeRef.current.src = urlWithTimestamp;

                                // Method 2: Force reload after a short delay
                                setTimeout(() => {
                                    try {
                                        if (iframeRef.current?.contentWindow) {
                                            iframeRef.current.contentWindow.location.reload();
                                            console.log('[sandbox] Force reloaded iframe content');
                                        }
                                    } catch (e) {
                                        console.log('[sandbox] Could not reload iframe (cross-origin):', e);
                                    }
                                }, 1000);
                            }
                        }, refreshDelay);
                    }

                } else {
                    throw new Error(finalData?.error || 'Failed to apply code');
                }
            } else {
                // If no final data was received, still close loading
                addChatMessage('Code application may have partially succeeded. Check the preview.', 'system');
            }
        } catch (error: any) {
            log(`Failed to apply code: ${error.message}`, 'error');
        } finally {
            setLoading(false);
            // Clear isEdit flag after applying code
            setGenerationProgress(prev => ({
                ...prev,
                isEdit: false
            }));
        }
    };

    const finishChallenge = async () => {
        if (!sandboxData?.url) {
            addChatMessage('No sandbox available to capture.', 'system');
            return;
        }
        const selectedFaculty = searchParams.get('selectedFaculty');
        posthog.capture('finished_challenge', {
            selectedCardId,
            username,
            selectedFaculty,
            similarityScore
        })
        setPreviousCard(selectedCardId ? CardStorage.getCardById(parseInt(selectedCardId)) : null);

        setIsCapturingScreenshot(true);
        setJudgingStatus('submitting');
        setLoadingStage('judging');
        setLoading(true);
        addChatMessage('🎯 Finishing challenge - capturing your creation...', 'system');

        try {
            // Step 1: Capture screenshot of the generated sandbox
            const screenshotResponse = await fetch('/api/scrape-screenshot-v2', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: sandboxData.url })
            });

            if (!screenshotResponse.ok) {
                throw new Error('Failed to capture screenshot');
            }

            const screenshotData = await screenshotResponse.json();

            if (!screenshotData.success || !screenshotData.screenshot) {
                throw new Error('Screenshot capture failed');
            }

            setGeneratedImage(screenshotData.screenshot);

            // Step 2: Get the original image
            const originalImageResponse = await fetch(`/images/image-${selectedCardId}.png`);
            if (!originalImageResponse.ok) {
                throw new Error('Failed to load original image');
            }

            const originalImageBlob = await originalImageResponse.blob();

            // Step 3: Convert screenshot to blob
            const screenshotResponse2 = await fetch(screenshotData.screenshot);
            const screenshotBlob = await screenshotResponse2.blob();

            // Step 4: Compare images using decide-similarity API

            setJudgingStatus('grading');
            const formData = new FormData();
            formData.append('original', originalImageBlob, 'original.png');
            formData.append('generated', screenshotBlob, 'generated.png');

            const similarityResponse = await fetch('/api/decide-similarity', {
                method: 'POST',
                body: formData
            });

            if (!similarityResponse.ok) {
                throw new Error('Failed to analyze similarity');
            }

            const similarityData = await similarityResponse.json();

            // Step 5: Display results
            setJudgingStatus('completed-bridging');
            setSimilarityScore(similarityData.score);
            setChallengeCompleted(true);

            // Save best score to local storage
            if (selectedCardId && username) {
                const faculty = searchParams.get('selectedFaculty');
                if (faculty) {
                    CardStorage.updateCardBestScore(
                        parseInt(selectedCardId),
                        {
                            name: username,
                            faculty: faculty,
                            score: similarityData.score
                        }
                    );

                    if (previousCard?.best?.score === null) {
                        setTimeout(() => {
                        setJudgingStatus('completed-first-own');
                        }, 500);
                    } else if (previousCard?.best?.score && similarityData.score < previousCard.best.score) {
                        setTimeout(() => {
                            setJudgingStatus('completed-lower-score');
                        }, 3000);
                    } else {
                        setTimeout(() => {
                            setJudgingStatus('completed-higher-score');
                        }, 3000);
                    }
                }
            }

            addChatMessage(`🎉 Challenge Complete! Your similarity score is: **${similarityData.score}/100**`, 'system');

            if (similarityData.score >= 90) {
                addChatMessage('🌟 Excellent work! Your recreation is nearly identical to the original!', 'system');
            } else if (similarityData.score >= 70) {
                addChatMessage('💪 Great job! Your recreation captures most of the original design!', 'system');
            } else if (similarityData.score >= 50) {
                addChatMessage('👍 Good effort! There\'s room for improvement in the details.', 'system');
            } else {
                addChatMessage('🎯 Keep practicing! Try focusing on the key visual elements.', 'system');
            }

        } catch (error: any) {
            console.error('Finish challenge error:', error);
            addChatMessage(`❌ Failed to complete challenge: ${error.message}`, 'error');
        } finally {
            setIsCapturingScreenshot(false);
            setLoadingStage(null);
            setLoading(false);
        }
    };

    const sendChatMessage = async () => {
        const message = aiChatInput.trim();
        if (!message) return;

        if (promptCount === 0) {
            addChatMessage('No prompts left! Click "Finish Challenge" to see your score.', 'system');
            return;
        }

        setPromptCount((prev) => prev - 1);
        setLoading(true);

        if (!aiEnabled) {
            addChatMessage('AI is disabled. Please enable it first.', 'system');
            return;
        }

        addChatMessage(message, 'user');
        setAiChatInput('');

        // Check for special commands
        const lowerMessage = message.toLowerCase().trim();
        if (lowerMessage === 'check packages' || lowerMessage === 'install packages' || lowerMessage === 'npm install') {
            if (!sandboxData) {
                addChatMessage('No active sandbox. Create a sandbox first!', 'system');
                return;
            }
            // Package checking handled automatically during code application
            addChatMessage('Package installation is handled automatically when you generate code with npm imports.', 'system');
            return;
        }

        // Start sandbox creation in parallel if needed
        let sandboxPromise: Promise<void> | null = null;
        let sandboxCreating = false;

        if (!sandboxData) {
            sandboxCreating = true;
            addChatMessage('Creating sandbox while I plan your component...', 'system');
            sandboxPromise = createSandbox(true).catch((error: any) => {
                addChatMessage(`Failed to create sandbox: ${error.message}`, 'system');
                throw error;
            });
        }

        // Determine if this is an edit
        const isEdit = conversationContext.appliedCode.length > 0;

        try {
            // Generation tab is already active from scraping phase
            setGenerationProgress(prev => ({
                ...prev,  // Preserve all existing state
                isGenerating: true,
                status: 'Starting AI generation...',
                components: [],
                currentComponent: 0,
                streamedCode: '',
                isStreaming: false,
                isThinking: true,
                thinkingText: 'Analyzing your request...',
                thinkingDuration: undefined,
                currentFile: undefined,
                lastProcessedPosition: 0,
                // Add isEdit flag to generation progress
                isEdit: isEdit,
                // Keep existing files for edits - we'll mark edited ones differently
                files: prev.files
            }));

            // Backend now manages file state - no need to fetch from frontend
            console.log('[sandbox-chat] Using backend file cache for context');

            const fullContext = {
                sandboxId: sandboxData?.sandboxId || (sandboxCreating ? 'pending' : null),
                structure: structureContent,
                recentMessages: chatMessages.slice(-20),
                conversationContext: conversationContext,
                currentCode: promptInput,
                sandboxUrl: sandboxData?.url,
                sandboxCreating: sandboxCreating
            };

            // Debug what we're sending
            console.log('[sandbox-chat] Sending context to AI:');
            console.log('[sandbox-chat] - sandboxId:', fullContext.sandboxId);
            console.log('[sandbox-chat] - isEdit:', conversationContext.appliedCode.length > 0);

            const response = await fetch('/api/generate-ai-code-stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: message,
                    model: aiModel,
                    context: fullContext,
                    isEdit: conversationContext.appliedCode.length > 0
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let generatedCode = '';
            let explanation = '';

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));

                                if (data.type === 'status') {
                                    setGenerationProgress(prev => ({ ...prev, status: data.message }));
                                } else if (data.type === 'thinking') {
                                    setGenerationProgress(prev => ({
                                        ...prev,
                                        isThinking: true,
                                        thinkingText: (prev.thinkingText || '') + data.text
                                    }));
                                } else if (data.type === 'thinking_complete') {
                                    setGenerationProgress(prev => ({
                                        ...prev,
                                        isThinking: false,
                                        thinkingDuration: data.duration
                                    }));
                                } else if (data.type === 'conversation') {
                                    // Add conversational text to chat only if it's not code
                                    let text = data.text || '';

                                    // Remove package tags from the text
                                    text = text.replace(/<package>[^<]*<\/package>/g, '');
                                    text = text.replace(/<packages>[^<]*<\/packages>/g, '');

                                    // Filter out any XML tags and file content that slipped through
                                    if (!text.includes('<file') && !text.includes('import React') &&
                                        !text.includes('export default') && !text.includes('className=') &&
                                        text.trim().length > 0) {
                                        addChatMessage(text.trim(), 'ai');
                                    }
                                } else if (data.type === 'stream' && data.raw) {
                                    setGenerationProgress(prev => {
                                        const newStreamedCode = prev.streamedCode + data.text;

                                        // Tab is already switched after scraping
                                        setActiveTab('generation');

                                        const updatedState = {
                                            ...prev,
                                            streamedCode: newStreamedCode,
                                            isStreaming: true,
                                            isThinking: false,
                                            status: 'Generating code...'
                                        };

                                        // Process complete files from the accumulated stream
                                        const fileRegex = /<file path="([^"]+)">([^]*?)<\/file>/g;
                                        let match;
                                        const processedFiles = new Set(prev.files.map(f => f.path));

                                        while ((match = fileRegex.exec(newStreamedCode)) !== null) {
                                            const filePath = match[1];
                                            const fileContent = match[2];

                                            // Only add if we haven't processed this file yet
                                            if (!processedFiles.has(filePath)) {
                                                const fileExt = filePath.split('.').pop() || '';
                                                const fileType = fileExt === 'jsx' || fileExt === 'js' ? 'javascript' :
                                                    fileExt === 'css' ? 'css' :
                                                        fileExt === 'json' ? 'json' :
                                                            fileExt === 'html' ? 'html' : 'text';

                                                // Check if file already exists
                                                const existingFileIndex = updatedState.files.findIndex(f => f.path === filePath);

                                                if (existingFileIndex >= 0) {
                                                    // Update existing file and mark as edited
                                                    updatedState.files = [
                                                        ...updatedState.files.slice(0, existingFileIndex),
                                                        {
                                                            ...updatedState.files[existingFileIndex],
                                                            content: fileContent.trim(),
                                                            type: fileType,
                                                            completed: true,
                                                            edited: true
                                                        },
                                                        ...updatedState.files.slice(existingFileIndex + 1)
                                                    ];
                                                } else {
                                                    // Add new file
                                                    updatedState.files = [...updatedState.files, {
                                                        path: filePath,
                                                        content: fileContent.trim(),
                                                        type: fileType,
                                                        completed: true,
                                                        edited: false
                                                    }];
                                                }

                                                // Only show file status if not in edit mode
                                                if (!prev.isEdit) {
                                                    updatedState.status = `Completed ${filePath}`;
                                                }
                                                processedFiles.add(filePath);
                                            }
                                        }

                                        // Check for current file being generated (incomplete file at the end)
                                        const lastFileMatch = newStreamedCode.match(/<file path="([^"]+)">([^]*?)$/);
                                        if (lastFileMatch && !lastFileMatch[0].includes('</file>')) {
                                            const filePath = lastFileMatch[1];
                                            const partialContent = lastFileMatch[2];

                                            if (!processedFiles.has(filePath)) {
                                                const fileExt = filePath.split('.').pop() || '';
                                                const fileType = fileExt === 'jsx' || fileExt === 'js' ? 'javascript' :
                                                    fileExt === 'css' ? 'css' :
                                                        fileExt === 'json' ? 'json' :
                                                            fileExt === 'html' ? 'html' : 'text';

                                                updatedState.currentFile = {
                                                    path: filePath,
                                                    content: partialContent,
                                                    type: fileType
                                                };
                                                // Only show file status if not in edit mode
                                                if (!prev.isEdit) {
                                                    updatedState.status = `Generating ${filePath}`;
                                                }
                                            }
                                        } else {
                                            updatedState.currentFile = undefined;
                                        }

                                        return updatedState;
                                    });
                                } else if (data.type === 'complete') {
                                    generatedCode = data.generatedCode;
                                    explanation = data.explanation;

                                    // Save the last generated code
                                    setConversationContext(prev => ({
                                        ...prev,
                                        lastGeneratedCode: generatedCode
                                    }));

                                    // Clear thinking state when generation completes
                                    setGenerationProgress(prev => ({
                                        ...prev,
                                        isThinking: false,
                                        thinkingText: undefined,
                                        thinkingDuration: undefined
                                    }));

                                    // Store packages to install from tool calls
                                    if (data.packagesToInstall && data.packagesToInstall.length > 0) {
                                        console.log('[generate-code] Packages to install from tools:', data.packagesToInstall);
                                        // Store packages globally for later installation
                                        (window as any).pendingPackages = data.packagesToInstall;
                                    }

                                    // Parse all files from the completed code if not already done
                                    const fileRegex = /<file path="([^"]+)">([^]*?)<\/file>/g;
                                    const parsedFiles: Array<{ path: string; content: string; type: string; completed: boolean }> = [];
                                    let fileMatch;

                                    while ((fileMatch = fileRegex.exec(data.generatedCode)) !== null) {
                                        const filePath = fileMatch[1];
                                        const fileContent = fileMatch[2];
                                        const fileExt = filePath.split('.').pop() || '';
                                        const fileType = fileExt === 'jsx' || fileExt === 'js' ? 'javascript' :
                                            fileExt === 'css' ? 'css' :
                                                fileExt === 'json' ? 'json' :
                                                    fileExt === 'html' ? 'html' : 'text';

                                        parsedFiles.push({
                                            path: filePath,
                                            content: fileContent.trim(),
                                            type: fileType,
                                            completed: true
                                        });
                                    }

                                    setGenerationProgress(prev => ({
                                        ...prev,
                                        status: `Generated ${parsedFiles.length > 0 ? parsedFiles.length : prev.files.length} file${(parsedFiles.length > 0 ? parsedFiles.length : prev.files.length) !== 1 ? 's' : ''}!`,
                                        isGenerating: false,
                                        isStreaming: false,
                                        isEdit: prev.isEdit,
                                        // Keep the files that were already parsed during streaming
                                        files: prev.files.length > 0 ? prev.files : parsedFiles
                                    }));
                                } else if (data.type === 'error') {
                                    throw new Error(data.error);
                                }
                            } catch (e) {
                                console.error('Failed to parse SSE data:', e);
                            }
                        }
                    }
                }
            }

            if (generatedCode) {
                // Parse files from generated code for metadata
                const fileRegex = /<file path="([^"]+)">([^]*?)<\/file>/g;
                const generatedFiles = [];
                let match;
                while ((match = fileRegex.exec(generatedCode)) !== null) {
                    generatedFiles.push(match[1]);
                }

                // Show appropriate message based on edit mode
                if (isEdit && generatedFiles.length > 0) {
                    // For edits, show which file(s) were edited
                    const editedFileNames = generatedFiles.map(f => f.split('/').pop()).join(', ');
                    addChatMessage(
                        explanation || `Updated ${editedFileNames}`,
                        'ai',
                        {
                            appliedFiles: [generatedFiles[0]] // Only show the first edited file
                        }
                    );
                } else {
                    // For new generation, show all files
                    addChatMessage(explanation || 'Code generated!', 'ai', {
                        appliedFiles: generatedFiles
                    });
                }

                setPromptInput(generatedCode);
                // Don't show the Generated Code panel by default
                // setLeftPanelVisible(true);

                // Wait for sandbox creation if it's still in progress
                if (sandboxPromise) {
                    addChatMessage('Waiting for sandbox to be ready...', 'system');
                    try {
                        await sandboxPromise;
                        // Remove the waiting message
                        setChatMessages(prev => prev.filter(msg => msg.content !== 'Waiting for sandbox to be ready...'));
                    } catch {
                        addChatMessage('Sandbox creation failed. Cannot apply code.', 'system');
                        return;
                    }
                }

                if (sandboxData && generatedCode) {
                    // Use isEdit flag that was determined at the start
                    await applyGeneratedCode(generatedCode, isEdit);
                }
            }

            // Show completion status briefly then switch to preview
            setGenerationProgress(prev => ({
                ...prev,
                isGenerating: false,
                isStreaming: false,
                status: 'Generation complete!',
                isEdit: prev.isEdit,
                // Clear thinking state on completion
                isThinking: false,
                thinkingText: undefined,
                thinkingDuration: undefined
            }));

            setTimeout(() => {
                // Switch to preview but keep files for display
                setActiveTab('preview');
            }, 1000); // Reduced from 3000ms to 1000ms
        } catch (error: any) {
            setChatMessages(prev => prev.filter(msg => msg.content !== 'Thinking...'));
            addChatMessage(`Error: ${error.message}`, 'system');
            // Reset generation progress and switch back to preview on error
            setGenerationProgress({
                isGenerating: false,
                status: '',
                components: [],
                currentComponent: 0,
                streamedCode: '',
                isStreaming: false,
                isThinking: false,
                thinkingText: undefined,
                thinkingDuration: undefined,
                files: [],
                currentFile: undefined,
                lastProcessedPosition: 0
            });
            setActiveTab('preview');
        }
    };

    const handleFileClick = async (filePath: string) => {
        setSelectedFile(filePath);
    };

    const getFileIcon = (fileName: string) => {
        const ext = fileName.split('.').pop()?.toLowerCase();

        if (ext === 'jsx' || ext === 'js') {
            return <SiJavascript className="w-4 h-4 text-yellow-500" />;
        } else if (ext === 'tsx' || ext === 'ts') {
            return <SiReact className="w-4 h-4 text-blue-500" />;
        } else if (ext === 'css') {
            return <SiCss3 className="w-4 h-4 text-blue-500" />;
        } else if (ext === 'json') {
            return <SiJson className="w-4 h-4 text-gray-600" />;
        } else {
            return <FiFile className="w-4 h-4 text-gray-600" />;
        }
    };

    const resetGame = () => {
        router.push('/');
    }



    const renderMainContent = () => {
        if (activeTab === 'generation' && (generationProgress.isGenerating || generationProgress.files.length > 0)) {
            return (
                /* Generation Tab Content */
                <div className="absolute inset-0 flex overflow-hidden">
                    {/* Code Content */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Image placeholder in top right */}
                        <div className="absolute top-4 right-4 z-10 w-56 h-32 bg-gray-200 border border-gray-300 rounded-lg" >
                            <Image src={`/images/image-${selectedCardId}.png`} alt="Selected Image" fill className='object-contain' />
                            </div>

                        {/* Thinking Mode Display - Only show during active generation */}
                        {generationProgress.isGenerating && (generationProgress.isThinking || generationProgress.thinkingText) && (
                            <div className="px-6 pb-6">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="text-purple-600 font-medium flex items-center gap-2">
                                        {generationProgress.isThinking ? (
                                            <>
                                                <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse" />
                                                AI is thinking...
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-purple-600">✓</span>
                                                Thought for {generationProgress.thinkingDuration || 0} seconds
                                            </>
                                        )}
                                    </div>
                                </div>
                                {generationProgress.thinkingText && (
                                    <div className="bg-purple-950 border border-purple-700 rounded-lg p-4 max-h-48 overflow-y-auto scrollbar-hide">
                                        <pre className="text-xs font-mono text-purple-300 whitespace-pre-wrap">
                                            {generationProgress.thinkingText}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Live Code Display */}
                        <div className="flex-1 rounded-lg p-6 flex flex-col min-h-0 overflow-hidden">
                            <div className="flex-1 overflow-y-auto min-h-0 scrollbar-hide" ref={codeDisplayRef}>
                                {/* Show selected file if one is selected */}
                                {selectedFile ? (
                                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="bg-black border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                                            <div className="px-4 py-2 bg-blue-800 text-white flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    {getFileIcon(selectedFile)}
                                                    <span className="font-mono text-sm">{selectedFile}</span>
                                                </div>
                                                <button
                                                    onClick={() => setSelectedFile(null)}
                                                    className="hover:bg-black/20 p-1 rounded transition-colors"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                            <div className="bg-gray-900 border border-gray-700 rounded">
                                                <SyntaxHighlighter
                                                    language={(() => {
                                                        const ext = selectedFile.split('.').pop()?.toLowerCase();
                                                        if (ext === 'css') return 'css';
                                                        if (ext === 'json') return 'json';
                                                        if (ext === 'html') return 'html';
                                                        return 'jsx';
                                                    })()}
                                                    style={vscDarkPlus}
                                                    customStyle={{
                                                        margin: 0,
                                                        padding: '1rem',
                                                        fontSize: '0.875rem',
                                                        background: 'transparent',
                                                    }}
                                                    showLineNumbers={true}
                                                >
                                                    {(() => {
                                                        // Find the file content from generated files
                                                        const file = generationProgress.files.find(f => f.path === selectedFile);
                                                        return file?.content || '// File content will appear here';
                                                    })()}
                                                </SyntaxHighlighter>
                                            </div>
                                        </div>
                                    </div>
                                ) : /* If no files parsed yet, show loading or raw stream */
                                    generationProgress.files.length === 0 && !generationProgress.currentFile ? (
                                        generationProgress.isThinking ? (
                                            // Beautiful loading state while thinking
                                            <div className="flex items-center justify-center h-full">
                                                <div className="text-center">
                                                    <div className="mb-8 relative">
                                                        <div className="w-24 h-24 mx-auto">
                                                            <div className="absolute inset-0 border-4 border-gray-800 rounded-full"></div>
                                                            <div className="absolute inset-0 border-4 border-green-500 rounded-full animate-spin border-t-transparent"></div>
                                                        </div>
                                                    </div>
                                                    <h3 className="text-xl font-medium text-white mb-2">AI is analyzing your request</h3>
                                                    <p className="text-gray-400 text-sm">{generationProgress.status || 'Preparing to generate code...'}</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="bg-black border border-gray-200 rounded-lg overflow-hidden">
                                                <div className="px-4 py-2 bg-gray-100 text-gray-900 flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                                        <span className="font-mono text-sm">Streaming code...</span>
                                                    </div>
                                                </div>
                                                <div className="bg-gray-900 border border-gray-700 rounded">
                                                    <SyntaxHighlighter
                                                        language="jsx"
                                                        style={vscDarkPlus}
                                                        customStyle={{
                                                            margin: 0,
                                                            padding: '1rem',
                                                            fontSize: '0.875rem',
                                                            background: 'transparent',
                                                        }}
                                                        showLineNumbers={true}
                                                    >
                                                        {generationProgress.streamedCode || 'Starting code generation...'}
                                                    </SyntaxHighlighter>
                                                    <span className="inline-block w-2 h-4 bg-blue-400 ml-1 animate-pulse" />
                                                </div>
                                            </div>
                                        )
                                    ) : (
                                        <div className="space-y-4">
                                            {/* Show current file being generated */}
                                            {generationProgress.currentFile && (
                                                <div className="bg-black border-2 border-gray-400 rounded-lg overflow-hidden shadow-sm">
                                                    <div className="px-4 py-2 bg-blue-800 text-white flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                            <span className="font-mono text-sm">{generationProgress.currentFile.path}</span>
                                                            <span className={`px-2 py-0.5 text-xs rounded ${generationProgress.currentFile.type === 'css' ? 'bg-blue-600 text-white' :
                                                                    generationProgress.currentFile.type === 'javascript' ? 'bg-yellow-600 text-white' :
                                                                        generationProgress.currentFile.type === 'json' ? 'bg-green-600 text-white' :
                                                                            'bg-gray-200 text-gray-700'
                                                                }`}>
                                                                {generationProgress.currentFile.type === 'javascript' ? 'JSX' : generationProgress.currentFile.type.toUpperCase()}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="bg-gray-900 border border-gray-700 rounded">
                                                        <SyntaxHighlighter
                                                            language={
                                                                generationProgress.currentFile.type === 'css' ? 'css' :
                                                                    generationProgress.currentFile.type === 'json' ? 'json' :
                                                                        generationProgress.currentFile.type === 'html' ? 'html' :
                                                                            'jsx'
                                                            }
                                                            style={vscDarkPlus}
                                                            customStyle={{
                                                                margin: 0,
                                                                padding: '1rem',
                                                                fontSize: '0.75rem',
                                                                background: 'transparent',
                                                            }}
                                                            showLineNumbers={true}
                                                        >
                                                            {generationProgress.currentFile.content}
                                                        </SyntaxHighlighter>
                                                        <span className="inline-block w-2 h-3 bg-blue-400 ml-4 mb-4 animate-pulse" />
                                                    </div>
                                                </div>
                                            )}

                                            {/* Show completed files */}
                                            {generationProgress.files.map((file, idx) => (
                                                <div key={idx} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                                                    <div className="px-4 py-2 bg-blue-800 text-white flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-green-500">✓</span>
                                                            <span className="font-mono text-sm">{file.path}</span>
                                                        </div>
                                                        <span className={`px-2 py-0.5 text-xs rounded ${file.type === 'css' ? 'bg-blue-600 text-white' :
                                                                file.type === 'javascript' ? 'bg-yellow-600 text-white' :
                                                                    file.type === 'json' ? 'bg-green-600 text-white' :
                                                                        'bg-gray-200 text-gray-700'
                                                            }`}>
                                                            {file.type === 'javascript' ? 'JSX' : file.type.toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <div className="bg-gray-900 border border-gray-700  max-h-48 overflow-y-auto scrollbar-hide">
                                                        <SyntaxHighlighter
                                                            language={
                                                                file.type === 'css' ? 'css' :
                                                                    file.type === 'json' ? 'json' :
                                                                        file.type === 'html' ? 'html' :
                                                                            'jsx'
                                                            }
                                                            style={vscDarkPlus}
                                                            customStyle={{
                                                                margin: 0,
                                                                padding: '1rem',
                                                                fontSize: '0.75rem',
                                                                background: 'transparent',
                                                            }}
                                                            showLineNumbers={true}
                                                            wrapLongLines={true}
                                                        >
                                                            {file.content}
                                                        </SyntaxHighlighter>
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Show remaining raw stream if there's content after the last file */}
                                            {!generationProgress.currentFile && generationProgress.streamedCode.length > 0 && (
                                                <div className="bg-black border border-gray-200 rounded-lg overflow-hidden">
                                                    <div className="px-4 py-2 bg-blue-800 text-white flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                                            <span className="font-mono text-sm">Processing...</span>
                                                        </div>
                                                    </div>
                                                    <div className="bg-gray-900 border border-gray-700 rounded">
                                                        <SyntaxHighlighter
                                                            language="jsx"
                                                            style={vscDarkPlus}
                                                            customStyle={{
                                                                margin: 0,
                                                                padding: '1rem',
                                                                fontSize: '0.75rem',
                                                                background: 'transparent',
                                                            }}
                                                            showLineNumbers={false}
                                                        >
                                                            {(() => {
                                                                // Show only the tail of the stream after the last file
                                                                const lastFileEnd = generationProgress.files.length > 0
                                                                    ? generationProgress.streamedCode.lastIndexOf('</file>') + 7
                                                                    : 0;
                                                                let remainingContent = generationProgress.streamedCode.slice(lastFileEnd).trim();

                                                                // Remove explanation tags and content
                                                                remainingContent = remainingContent.replace(/<explanation>[\s\S]*?<\/explanation>/g, '').trim();

                                                                // If only whitespace or nothing left, show waiting message
                                                                return remainingContent || 'Waiting for next file...';
                                                            })()}
                                                        </SyntaxHighlighter>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                            </div>
                        </div>

                        {/* Progress indicator */}
                        {generationProgress.components.length > 0 && (
                            <div className="mx-6 mb-6">
                                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300"
                                        style={{
                                            width: `${(generationProgress.currentComponent / Math.max(generationProgress.components.length, 1)) * 100}%`
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            );
        } else if (activeTab === 'preview') {
            // Show loading animation when capturing screenshot
            if (isCapturingScreenshot) {
                return (
                    <div className="flex items-center justify-center h-full bg-gray-900">
                        <div className="text-center">
                            <div className="w-12 h-12 border-3 border-gray-600 border-t-white rounded-full animate-spin mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-white">Gathering website information</h3>
                        </div>
                    </div>
                );
            }

            // Check loading stage FIRST to prevent showing old sandbox

            // Don't show loading overlay for edits
            if (loadingStage || (generationProgress.isGenerating && !generationProgress.isEdit)) {
                return (
                    <div className="relative w-full h-full bg-gray-50 flex items-center justify-center">
                        {/* Image placeholder in top right */}
                        <div className="absolute top-4 right-4 z-10 w-56 h-32 bg-gray-200 border border-gray-300 rounded-lg" >
                            <Image src={`/images/image-${selectedCardId}.png`} alt="Selected Image" fill className='object-contain' />
                        </div>

                        <div className="text-center">
                            <div className="mb-8">
                                <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
                            </div>
                            <h3 className="text-xl font-semibold text-gray-800 mb-2">
                                {loadingStage === 'gathering' && 'Gathering website information...'}
                                {loadingStage === 'planning' && 'Planning your design...'}
                                {loadingStage === 'judging' && 'Judging your application...'}
                                {(loadingStage === 'generating' || generationProgress.isGenerating) && 'Generating your Image...'}
                            </h3>
                            <p className="text-gray-600 text-sm">
                                {loadingStage === 'gathering' && 'Analyzing the website structure and content'}
                                {loadingStage === 'planning' && 'Creating the optimal React component architecture'}
                                {loadingStage === 'judging' && 'Our AI would judge the similarity of your application to the original image'}
                                {(loadingStage === 'generating' || generationProgress.isGenerating) && 'Vibing your application based on your prompt'}
                            </p>
                        </div>
                    </div>
                );
            }

            // Show sandbox iframe only when not in any loading state
            if (sandboxData?.url && !loading) {
                return (
                    <div className="relative w-full h-full">
                        {/* Image placeholder in top right */}
                        <div className="absolute top-4 right-4 z-10 w-56 h-32 bg-gray-200 border border-gray-300 rounded-lg" >
                            <Image src={`/images/image-${selectedCardId}.png`} alt="Selected Image" fill className='object-contain' />
                        </div>

                        <iframe
                            ref={iframeRef}
                            src={sandboxData.url}
                            className="w-full h-full border-none"
                            title="Sandbox Preview"
                            allow="clipboard-write"
                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                        />
                        {/* Refresh button */}
                        <button
                            onClick={() => {
                                if (iframeRef.current && sandboxData?.url) {
                                    console.log('[Manual Refresh] Forcing iframe reload...');
                                    const newSrc = `${sandboxData.url}?t=${Date.now()}&manual=true`;
                                    iframeRef.current.src = newSrc;
                                }
                            }}
                            className="absolute bottom-4 right-4 bg-white/90 hover:bg-white text-gray-700 p-2 rounded-lg shadow-lg transition-all duration-200 hover:scale-105"
                            title="Refresh sandbox"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </button>
                    </div>
                );
            }

            // Default state when no sandbox and no screenshot
            return (
                <div className="flex items-center justify-center h-full bg-gray-50 text-gray-600 text-lg">
                    {sandboxData ? (
                        <div className="text-gray-500">
                            <div className="w-8 h-8 border-2 border-gray-300 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                            <p className="text-sm">Loading preview...</p>
                        </div>
                    ) : (
                        <div className="text-gray-500 text-center">
                            <p className="text-sm">Start chatting to create your first component</p>
                        </div>
                    )}
                </div>
            );
        }
        return null;
    };

    const restartGame = () => {
        createSandbox();
        setJudgingStatus(null);
        setGeneratedImage(null);
        setPreviousCard(null);
        setSimilarityScore(null);
        setChatMessages([]);
        setAiChatInput('');
        setPromptInput('');
        setPromptCount(MAX_PROMPT_COUNT);
        setGenerationProgress({
            isGenerating: false,
            status: '',
            components: [],
            currentComponent: 0,
            streamedCode: '',
            isStreaming: false,
            isThinking: false,
            thinkingText: undefined,
            thinkingDuration: undefined,
            files: [],
            currentFile: undefined,
            lastProcessedPosition: 0
        });
    }

    return (
        <div className="font-sans bg-background text-foreground h-screen flex flex-col">
            {/* Loading Background */}
            {showLoadingBackground && (
                <div className="fixed inset-0 z-50 font-pixelify bg-black/10 backdrop-blur-lg flex items-center justify-center p-4">
                    <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-8 shadow-2xl max-w-3xl w-full border border-white/20">
                        <div className="text-center mb-6">
                            <div className="relative mx-auto w-16 h-16 mb-4">
                                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400 to-blue-600 animate-pulse"></div>
                                <div className="absolute inset-2 rounded-full bg-white flex items-center justify-center">
                                    {/* <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> */}
                                    <Image src="/images/logo.png" alt="Logo" width={24} height={24} className='object-contain animate-pulse' />
                                </div>
                            </div>
                            <h2 className="text-3xl font-bold  bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-2">
                                Setting up your sandbox...
                            </h2>
                            <p className="text-gray-600">GDGoC Prompting Challenge</p>
                        </div>
                        
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentTipIndex}
                                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                                    transition={{ duration: 0.6, ease: "easeOut" }}
                                    className="text-center"
                                >
                                    <div className="text-2xl mb-2">💡</div>
                                    <p className="text-gray-700 text-lg font-medium leading-relaxed">
                                        {GAME_TIPS[currentTipIndex]}
                                    </p>
                                </motion.div>
                            </AnimatePresence>
                        </div>
                        
                        <div className="mt-6 flex justify-center">
                            <div className="flex space-x-1">
                                {GAME_TIPS.map((_, index) => (
                                    <div
                                        key={index}
                                        className={`w-2 h-2 rounded-full transition-all duration-300 ${
                                            index === currentTipIndex 
                                                ? 'bg-blue-500 w-6' 
                                                : 'bg-gray-300'
                                        }`}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {
                judgingStatus && (
                    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-scroll">
                            <div className="p-8">
                                {/* Header */}
                                <div className="text-center mb-8">
                                    <h2 className="text-3xl font-bold text-gray-800 mb-2">Challenge Results</h2>
                                    <p className="text-gray-600">Let's see how your creation compares to the original!</p>
                                </div>

                                {/* Image Comparison */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                                    {/* Original Image */}
                                    <div className="text-center">
                                        <div className="bg-gray-50 rounded-xl p-6 border-2 border-gray-200">
                                            <div className="relative w-full h-48 mb-4">
                                                <Image 
                                                    src={`/images/image-${selectedCardId}.png`} 
                                                    alt="Original Image" 
                                                    fill 
                                                    className='object-contain rounded-lg' 
                                                />
                                            </div>
                                            <h3 className="text-lg font-semibold text-gray-800 mb-1">Original Design</h3>
                                            <p className="text-sm text-gray-500">Target to recreate</p>
                                        </div>
                                    </div>

                                    {/* Generated/User Image */}
                                    <div className="text-center">
                                        <div className="bg-blue-50 rounded-xl p-6 border-2 border-blue-200">
                                            <div className="relative w-full h-48 mb-4 bg-white rounded-lg border border-gray-200">
                                                {/* Placeholder for generated image - you'll need to capture this */}
                                                <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                                                    <span className="text-sm">Your Creation</span>
                                                </div>
                                                {
                                                    generatedImage && (
                                                        <Image src={generatedImage} alt="Generated Image" fill className='object-contain' />
                                                    )
                                                }
                                            </div>
                                            <h3 className="text-lg font-semibold text-gray-800 mb-1">Your Creation</h3>
                                            <p className="text-sm text-gray-500">AI-generated result</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Previous Best Score Section */}
                                {previousCard?.best && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-6">
                                        <h4 className="text-lg font-semibold text-amber-800 mb-3">Previous Best Score</h4>
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-2xl font-bold text-amber-700">{previousCard.best.score}/100</p>
                                                <p className="text-sm text-amber-600">by {previousCard.best.name}</p>
                                                <p className="text-xs text-amber-500">{previousCard.best.faculty}</p>
                                            </div>
                                            <div className="text-amber-600">
                                                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Status and Results */}
                                <div className="text-center">
                                    {judgingStatus === 'submitting' && (
                                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                                            <div className="flex items-center justify-center gap-3 mb-3">
                                                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                                                <span className="text-lg font-semibold text-blue-700">Submitting...</span>
                                            </div>
                                            <p className="text-sm text-blue-600">Capturing your creation...</p>
                                        </div>
                                    )}

                                    {judgingStatus === 'grading' && (
                                        <div className="bg-purple-50 border border-purple-200 rounded-xl p-6">
                                            <div className="flex items-center justify-center gap-3 mb-3">
                                                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                                <span className="text-lg font-semibold text-purple-700">AI is Analyzing...</span>
                                            </div>
                                            <p className="text-sm text-purple-600">Comparing your creation to the original...</p>
                                        </div>
                                    )}

                                    {(judgingStatus === 'completed-bridging' || 
                                      judgingStatus === 'completed-first-own' || 
                                      judgingStatus === 'completed-higher-score' || 
                                      judgingStatus === 'completed-lower-score') && (
                                        <div className={`rounded-xl p-6 border-2 ${
                                            similarityScore && similarityScore >= 90 
                                                ? 'bg-green-50 border-green-200' 
                                                : similarityScore && similarityScore >= 70 
                                                    ? 'bg-blue-50 border-blue-200'
                                                    : 'bg-blue-50 border-blue-200'
                                        }`}>
                                            {judgingStatus === 'completed-bridging' && (
                                                <div>
                                                    <div className="flex items-center justify-center gap-3 mb-3">
                                                        <div className="w-6 h-6 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                                                        <span className="text-lg font-semibold text-gray-700">Calculating final score...</span>
                                                    </div>
                                                </div>
                                            )}

                                            {judgingStatus === 'completed-first-own' && (
                                                <div>
                                                    <div className="mb-4">
                                                        <div className="text-4xl font-bold text-blue-600 mb-2"><AnimatedScore targetScore={similarityScore || 0} /></div>
                                                        <div className="flex items-center justify-center gap-2 text-blue-700">
                                                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                                            </svg>
                                                            <span className="text-lg font-semibold">First to Try!</span>
                                                        </div>
                                                        <p className="text-sm text-blue-600 mt-2">You're the first person to attempt this challenge!</p>
                                                    </div>
                                                </div>
                                            )}

                                            {judgingStatus === 'completed-higher-score' && (
                                                <div>
                                                    <div className="mb-4">
                                                        <div className="text-4xl font-bold text-green-600 mb-2"><AnimatedScore targetScore={similarityScore || 0} /></div>
                                                        <div className="flex items-center justify-center gap-2 text-green-700">
                                                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                                                <path d="M7 14l3-3 3 3 5-5-1.5-1.5L12 12l-1.5-1.5L7 14z"/>
                                                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                                            </svg>
                                                            <span className="text-lg font-semibold">New High Score!</span>
                                                        </div>
                                                        <p className="text-sm text-green-600 mt-2">Congratulations! You beat the previous record!</p>
                                                    </div>
                                                </div>
                                            )}

                                            {judgingStatus === 'completed-lower-score' && (
                                                <div>
                                                    <div className="mb-4">
                                                        <div className="text-4xl font-bold text-blue-600 mb-2"><AnimatedScore targetScore={similarityScore || 0} /></div>
                                                        <div className="flex items-center justify-center gap-2 text-blue-700">
                                                            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                                                            </svg>
                                                            <span className="text-lg font-semibold">Good Effort!</span>
                                                        </div>
                                                        <p className="text-sm text-blue-600 mt-2">Keep practicing to beat the current high score!</p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Score interpretation */}
                                            {similarityScore !== null && (
                                                <div className="mt-4 text-sm text-gray-600">
                                                    {similarityScore >= 90 && "🌟 Excellent! Nearly identical to the original!"}
                                                    {similarityScore >= 70 && similarityScore < 90 && "💪 Great job! Very close to the original design!"}
                                                    {similarityScore >= 50 && similarityScore < 70 && "👍 Good effort! Getting there with more practice!"}
                                                    {similarityScore < 50 && "🎯 Keep going! Focus on the key visual elements!"}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Close button - only show when completed */}
                                {(judgingStatus === 'completed-first-own' || 
                                  judgingStatus === 'completed-higher-score' || 
                                  judgingStatus === 'completed-lower-score') && (
                                    <div className="text-center mt-8">
                                        <button
                                            onClick={resetGame}
                                            className="bg-gray-800 hover:bg-gray-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors duration-200"
                                        >
                                            Continue to Home
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            <div className="bg-card px-4 py-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Image src="/images/logo.png" alt="Logo" width={24} height={24} className='object-contain' />
                    <h1 className="text-lg font-semibold font-pixelify">Hello {username}! - Welcome to  GDGoC Prompting Challenge</h1>
                    <span className={`text-sm px-3 py-1.5 rounded-[10px] text-white font-medium [box-shadow:inset_0px_-2px_0px_0px_#171310,_0px_1px_6px_0px_rgba(58,_33,_8,_58%)] ${
                        challengeCompleted
                            ? 'bg-green-600'
                            : promptCount === 0
                                ? 'bg-blue-600'
                                : 'bg-blue-800'
                    }`}>
                        {challengeCompleted
                            ? `Score: ${similarityScore || 0}/100`
                            : promptCount === 0
                                ? 'Ready to Finish!'
                                : `Prompt Left: ${promptCount}`
                        }
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={restartGame}
                        disabled={loading}
                        className="inline-flex font-pixelify items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-500 text-white px-3 py-1.5 rounded-[10px] text-sm font-medium [box-shadow:inset_0px_-2px_0px_0px_#171310,_0px_1px_6px_0px_rgba(58,_33,_8,_58%)] hover:translate-y-[1px] hover:scale-[0.98] hover:[box-shadow:inset_0px_-1px_0px_0px_#171310,_0px_1px_3px_0px_rgba(58,_33,_8,_40%)] active:translate-y-[2px] active:scale-[0.97] active:[box-shadow:inset_0px_1px_1px_0px_#171310,_0px_1px_2px_0px_rgba(58,_33,_8,_30%)] transition-all duration-200 disabled:shadow-none disabled:hover:translate-y-0 disabled:hover:scale-100 disabled:cursor-not-allowed"
                        title="Restart sandbox session"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Restart
                    </button>
                    <button
                        onClick={() => {
                            finishChallenge();
                        }}
                        disabled={loading || challengeCompleted}
                        className="inline-flex font-pixelify items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-500 text-white px-3 py-1.5 rounded-[10px] text-sm font-medium [box-shadow:inset_0px_-2px_0px_0px_#171310,_0px_1px_6px_0px_rgba(58,_33,_8,_58%)] hover:translate-y-[1px] hover:scale-[0.98] hover:[box-shadow:inset_0px_-1px_0px_0px_#171310,_0px_1px_3px_0px_rgba(58,_33,_8,_40%)] active:translate-y-[2px] active:scale-[0.97] active:[box-shadow:inset_0px_1px_1px_0px_#171310,_0px_1px_2px_0px_rgba(58,_33,_8,_30%)] transition-all duration-200 disabled:shadow-none disabled:hover:translate-y-0 disabled:hover:scale-100 disabled:cursor-not-allowed"
                        title="Finish game and submit for judging"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Finish Challenge
                    </button>
                    <div className="inline-flex font-pixelify items-center gap-2 bg-blue-800 text-white px-3 py-1.5 rounded-[10px] text-sm font-medium [box-shadow:inset_0px_-2px_0px_0px_#171310,_0px_1px_6px_0px_rgba(58,_33,_8,_58%)]">
                        <span id="status-text">{status.text}</span>
                        <div className={`w-2 h-2 rounded-full ${status.active ? 'bg-green-500' : 'bg-gray-500'}`} />
                    </div>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Center Panel - AI Chat (1/3 of remaining width) */}
                <div className="flex-1 max-w-[400px] flex flex-col border-r border-border bg-background">
                    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1 scrollbar-hide" ref={chatMessagesRef}>
                        {chatMessages.map((msg, idx) => (
                            <div key={idx} className="block">
                                <div className={`flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'} mb-1`}>
                                    <div className="block">
                                        <div className={`block rounded-[10px] px-4 py-2 ${msg.type === 'user' ? 'bg-blue-800 text-white ml-auto max-w-[80%]' :
                                                msg.type === 'ai' ? 'bg-gray-100 text-gray-900 mr-auto max-w-[80%]' :
                                                    msg.type === 'system' ? 'bg-blue-800 text-white text-sm' :
                                                        msg.type === 'command' ? 'bg-blue-800 text-white font-mono text-sm' :
                                                            msg.type === 'error' ? 'bg-red-900 text-red-100 text-sm border border-red-700' :
                                                                'bg-blue-800 text-white text-sm'
                                            }`}>
                                            {msg.type === 'command' ? (
                                                <div className="flex items-start gap-2">
                                                    <span className={`text-xs ${msg.metadata?.commandType === 'input' ? 'text-blue-400' :
                                                            msg.metadata?.commandType === 'error' ? 'text-red-400' :
                                                                msg.metadata?.commandType === 'success' ? 'text-green-400' :
                                                                    'text-gray-400'
                                                        }`}>
                                                        {msg.metadata?.commandType === 'input' ? '$' : '>'}
                                                    </span>
                                                    <span className="flex-1 whitespace-pre-wrap text-white">{msg.content}</span>
                                                </div>
                                            ) : msg.type === 'error' ? (
                                                <div className="flex items-start gap-3">
                                                    <div className="flex-shrink-0">
                                                        <div className="w-8 h-8 bg-red-800 rounded-full flex items-center justify-center">
                                                            <svg className="w-5 h-5 text-red-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                            </svg>
                                                        </div>
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="font-semibold mb-1">Build Errors Detected</div>
                                                        <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                                                        <div className="mt-2 text-xs opacity-70">Press 'F' or click the Fix button above to resolve</div>
                                                    </div>
                                                </div>
                                            ) : (
                                                msg.content
                                            )}
                                        </div>

                                        {/* Show applied files if this is an apply success message */}
                                        {msg.metadata?.appliedFiles && msg.metadata.appliedFiles.length > 0 && (
                                            <div className="mt-2 inline-block bg-gray-100 rounded-[10px] p-3">
                                                <div className="text-xs font-medium mb-1 text-gray-700">
                                                    {msg.content.includes('Applied') ? 'Files Updated:' : 'Generated Files:'}
                                                </div>
                                                <div className="flex flex-wrap items-start gap-1">
                                                    {msg.metadata.appliedFiles.map((filePath, fileIdx) => {
                                                        const fileName = filePath.split('/').pop() || filePath;
                                                        const fileExt = fileName.split('.').pop() || '';

                                                        return (
                                                            <div
                                                                key={`applied-${fileIdx}`}
                                                                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-800 text-white rounded-[10px] text-xs animate-fade-in-up"
                                                                style={{ animationDelay: `${fileIdx * 30}ms` }}
                                                            >
                                                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${fileExt === 'css' ? 'bg-blue-400' :
                                                                        (fileExt === 'js' || fileExt === 'jsx') ? 'bg-yellow-400' :
                                                                            fileExt === 'json' ? 'bg-green-400' :
                                                                                'bg-gray-400'
                                                                    }`} />
                                                                {fileName}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Show generated files for completion messages - but only if no appliedFiles already shown */}
                                        {msg.type === 'ai' && generationProgress.files.length > 0 && idx === chatMessages.length - 1 && !msg.metadata?.appliedFiles && !chatMessages.some(m => m.metadata?.appliedFiles) && (
                                            <div className="mt-2 inline-block bg-gray-100 rounded-[10px] p-3">
                                                <div className="text-xs font-medium mb-1 text-gray-700">Generated Files:</div>
                                                <div className="flex flex-wrap items-start gap-1">
                                                    {generationProgress.files.map((file, fileIdx) => (
                                                        <div
                                                            key={`complete-${fileIdx}`}
                                                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-800 text-white rounded-[10px] text-xs animate-fade-in-up"
                                                            style={{ animationDelay: `${fileIdx * 30}ms` }}
                                                        >
                                                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${file.type === 'css' ? 'bg-blue-400' :
                                                                    file.type === 'javascript' ? 'bg-yellow-400' :
                                                                        file.type === 'json' ? 'bg-green-400' :
                                                                            'bg-gray-400'
                                                                }`} />
                                                            {file.path.split('/').pop()}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Code application progress */}
                        {codeApplicationState.stage && (
                            <CodeApplicationProgress state={codeApplicationState} />
                        )}

                        {/* File generation progress - inline display (during generation) */}
                        {generationProgress.isGenerating && (
                            <div className="inline-block bg-gray-100 rounded-lg p-3">
                                <div className="text-sm font-medium mb-2 text-gray-700">
                                    {generationProgress.status}
                                </div>
                                <div className="flex flex-wrap items-start gap-1">
                                    {/* Show completed files */}
                                    {generationProgress.files.map((file, idx) => (
                                        <div
                                            key={`file-${idx}`}
                                            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-800 text-white rounded-[10px] text-xs animate-fade-in-up"
                                            style={{ animationDelay: `${idx * 30}ms` }}
                                        >
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                            {file.path.split('/').pop()}
                                        </div>
                                    ))}

                                    {/* Show current file being generated */}
                                    {generationProgress.currentFile && (
                                        <div className="flex items-center gap-1 px-2 py-1 bg-blue-800/70 text-white rounded-[10px] text-xs animate-pulse"
                                            style={{ animationDelay: `${generationProgress.files.length * 30}ms` }}>
                                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            {generationProgress.currentFile.path.split('/').pop()}
                                        </div>
                                    )}
                                </div>

                                {/* Live streaming response display */}
                                {generationProgress.streamedCode && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.3 }}
                                        className="mt-3 border-t border-gray-300 pt-3"
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="flex items-center gap-1">
                                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                                <span className="text-xs font-medium text-gray-600">AI Response Stream</span>
                                            </div>
                                            <div className="flex-1 h-px bg-gradient-to-r from-gray-300 to-transparent" />
                                        </div>
                                        <div className="bg-gray-900 border border-gray-700 rounded max-h-32 overflow-y-auto scrollbar-hide">
                                            <SyntaxHighlighter
                                                language="jsx"
                                                style={vscDarkPlus}
                                                customStyle={{
                                                    margin: 0,
                                                    padding: '0.75rem',
                                                    fontSize: '11px',
                                                    lineHeight: '1.5',
                                                    background: 'transparent',
                                                    maxHeight: '8rem',
                                                    overflow: 'hidden'
                                                }}
                                            >
                                                {(() => {
                                                    const lastContent = generationProgress.streamedCode.slice(-1000);
                                                    // Show the last part of the stream, starting from a complete tag if possible
                                                    const startIndex = lastContent.indexOf('<');
                                                    return startIndex !== -1 ? lastContent.slice(startIndex) : lastContent;
                                                })()}
                                            </SyntaxHighlighter>
                                            <span className="inline-block w-2 h-3 bg-blue-400 ml-3 mb-3 animate-pulse" />
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="p-4 border-t border-border bg-card">
                        <div className="relative">
                            <Textarea
                                className="min-h-[60px] pr-12 resize-y border-2 border-black focus:outline-none"
                                placeholder={
                                    promptCount === 0
                                        ? challengeCompleted
                                            ? "🎉 Challenge completed! Your score: " + (similarityScore || 0) + "/100"
                                            : "Click 'Finish Challenge' to see your similarity score!"
                                        : "Describe what you want to build..."
                                }
                                value={aiChatInput}
                                onChange={(e) => setAiChatInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey && promptCount > 0) {
                                        e.preventDefault();
                                        sendChatMessage();
                                    }
                                }}
                                disabled={challengeCompleted}
                                rows={3}
                            />
                            <button
                                onClick={promptCount === 0 ? finishChallenge : sendChatMessage}
                                // SINI LOL
                                disabled={(promptCount === 0 && challengeCompleted) || (promptCount === 0 && !aiEnabled) || (loading)}
                                className={`absolute right-2 bottom-2 p-2 text-white rounded-[10px] [box-shadow:inset_0px_-2px_0px_0px_#171310,_0px_1px_6px_0px_rgba(58,_33,_8,_58%)] hover:translate-y-[1px] hover:scale-[0.98] hover:[box-shadow:inset_0px_-1px_0px_0px_#171310,_0px_1px_3px_0px_rgba(58,_33,_8,_40%)] active:translate-y-[2px] active:scale-[0.97] active:[box-shadow:inset_0px_1px_1px_0px_#171310,_0px_1px_2px_0px_rgba(58,_33,_8,_30%)] transition-all duration-200 ${
                                    promptCount === 0
                                        ? 'bg-green-600 hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed'
                                        : 'bg-blue-800 hover:bg-blue-900'
                                }`}
                                title={promptCount === 0 ? "Finish Challenge" : "Send message (Enter)"}
                            >
                                {promptCount === 0 ? (
                                    challengeCompleted ? (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    )
                                ) : (
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right Panel - Preview or Generation (2/3 of remaining width) */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="px-4 py-2 bg-card border-b border-border flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <div className="flex bg-blue-800 rounded-lg p-1">
                                <button
                                    onClick={() => setActiveTab('generation')}
                                    className={`p-2 rounded-md transition-all ${activeTab === 'generation'
                                            ? 'bg-black text-white'
                                            : 'text-gray-300 hover:text-white hover:bg-gray-700'
                                        }`}
                                    title="Code"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => setActiveTab('preview')}
                                    className={`p-2 rounded-md transition-all ${activeTab === 'preview'
                                            ? 'bg-black text-white'
                                            : 'text-gray-300 hover:text-white hover:bg-gray-700'
                                        }`}
                                    title="Preview"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div className="flex gap-2 items-center">
                            {/* Live Code Generation Status - Moved to far right */}
                            {activeTab === 'generation' && (generationProgress.isGenerating || generationProgress.files.length > 0) && (
                                <div className="flex items-center gap-3">
                                    {!generationProgress.isEdit && (
                                        <div className="text-gray-600 text-sm">
                                            {generationProgress.files.length} files generated
                                        </div>
                                    )}
                                    <div className={`inline-flex items-center justify-center whitespace-nowrap rounded-[10px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-blue-800 text-white hover:bg-blue-800 [box-shadow:inset_0px_-2px_0px_0px_#171310,_0px_1px_6px_0px_rgba(58,_33,_8,_58%)] hover:translate-y-[1px] hover:scale-[0.98] hover:[box-shadow:inset_0px_-1px_0px_0px_#171310,_0px_1px_3px_0px_rgba(58,_33,_8,_40%)] active:translate-y-[2px] active:scale-[0.97] active:[box-shadow:inset_0px_1px_1px_0px_#171310,_0px_1px_2px_0px_rgba(58,_33,_8,_30%)] disabled:shadow-none disabled:hover:translate-y-0 disabled:hover:scale-100 h-8 px-3 py-1 text-sm gap-2`}>
                                        {generationProgress.isGenerating ? (
                                            <>
                                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                                                {generationProgress.isEdit ? 'Editing code' : 'Live code generation'}
                                            </>
                                        ) : (
                                            <>
                                                <div className="w-2 h-2 bg-gray-500 rounded-full" />
                                                COMPLETE
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                            {/* {sandboxData && !generationProgress.isGenerating && (
                <>
                  <Button
                    variant="code"
                    size="sm"
                    asChild
                  >
                    <a
                      href={sandboxData.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open in new tab"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </Button>
                </>
              )} */}
                        </div>
                    </div>
                    <div className="flex-1 relative overflow-hidden">
                        {renderMainContent()}
                    </div>
                </div>
            </div>
        </div>
    );
}