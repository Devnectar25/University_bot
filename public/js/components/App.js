// App.js - Root Application Component for GUNi Assistant
window.GUNi = window.GUNi || {};

const { useState, useEffect, useRef, useCallback } = React;

window.GUNi.App = function App() {
    const I18N = window.I18N || {};

    // ── 1. Language State ─────────────────────────────────────────────────────
    const [currentLanguage, setCurrentLanguage] = useState(() => {
        const saved = localStorage.getItem('guni_language');
        return I18N[saved] ? saved : 'en';
    });
    const t = I18N[currentLanguage] || I18N.en || {};

    const handleLanguageChange = (lang) => {
        if (I18N[lang]) {
            setCurrentLanguage(lang);
            localStorage.setItem('guni_language', lang);
        }
    };

    // ── 2. Sidebar State ──────────────────────────────────────────────────────
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        try { localStorage.removeItem('sidebar_collapsed'); } catch {}
        return localStorage.getItem('sidebar_user_collapsed') === 'true';
    });
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

    const toggleSidebar = useCallback(() => {
        if (window.innerWidth <= 768) {
            setIsMobileSidebarOpen((prev) => !prev);
        } else {
            setIsSidebarCollapsed((prev) => {
                const next = !prev;
                localStorage.setItem('sidebar_user_collapsed', next ? 'true' : 'false');
                return next;
            });
        }
    }, []);

    const closeMobileSidebar = useCallback(() => {
        setIsMobileSidebarOpen(false);
    }, []);

    // ── Sidebar Resizing (Desktop) ───────────────────────────────────────────
    const DEFAULT_SIDEBAR_WIDTH = 300;
    const MIN_SIDEBAR_WIDTH = 220;
    const MAX_SIDEBAR_WIDTH = 500;

    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = parseInt(localStorage.getItem('sidebar_custom_width'), 10);
        return saved >= MIN_SIDEBAR_WIDTH && saved <= MAX_SIDEBAR_WIDTH
            ? saved
            : DEFAULT_SIDEBAR_WIDTH;
    });
    const [isResizing, setIsResizing] = useState(false);

    const handleStartResize = (e) => {
        e.preventDefault();
        setIsResizing(true);
    };

    const handleResetSidebarWidth = () => {
        setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
        localStorage.setItem('sidebar_custom_width', DEFAULT_SIDEBAR_WIDTH.toString());
    };

    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e) => {
            const newWidth = Math.min(
                Math.max(e.clientX, MIN_SIDEBAR_WIDTH),
                MAX_SIDEBAR_WIDTH
            );
            setSidebarWidth(newWidth);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            setSidebarWidth((latestWidth) => {
                localStorage.setItem('sidebar_custom_width', latestWidth.toString());
                return latestWidth;
            });
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    // ── 3. Chat History & Active Conversation ─────────────────────────────────
    const HISTORY_KEY = 'chat_history_v1';
    const MAX_CONVERSATIONS = 50;
    const HISTORY_TURNS_LIMIT = 10;

    const [conversations, setConversations] = useState(() => {
        try {
            const raw = localStorage.getItem(HISTORY_KEY);
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });

    const [activeChatId, setActiveChatId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [lastUserMessage, setLastUserMessage] = useState('');

    // Persist conversations to localStorage
    useEffect(() => {
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(conversations.slice(0, MAX_CONVERSATIONS)));
        } catch {}
    }, [conversations]);

    // ── 4. Authenticated User State ───────────────────────────────────────────
    const [user, setUser] = useState(null);

    useEffect(() => {
        // Fetch current session info
        fetch('/api/me', { cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (data && data.user) setUser(data.user);
            })
            .catch(() => {});

        // Prime vector cache silently
        fetch('/api/warmup').catch(() => {});
    }, []);

    const handleLogout = async () => {
        try {
            await fetch('/api/logout', { method: 'POST' });
        } catch {}
        window.location.reload();
    };

    // ── 5. Keyboard Shortcuts & Resize Listeners ──────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
                e.preventDefault();
                toggleSidebar();
            }
        };

        const handleResize = () => {
            if (window.innerWidth > 768) {
                setIsMobileSidebarOpen(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', handleResize);
        };
    }, [toggleSidebar]);

    // ── 6. Chat Actions ───────────────────────────────────────────────────────
    const handleNewChat = () => {
        setActiveChatId(null);
        setMessages([]);
        setInputText('');
        setIsTyping(false);
        closeMobileSidebar();
    };

    const handleSelectChat = (id) => {
        const conv = conversations.find((c) => c.id === id);
        if (!conv) return;
        setActiveChatId(id);
        setMessages(conv.messages || []);
        setIsTyping(false);
        closeMobileSidebar();
    };

    const handleDeleteChat = (id) => {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (id === activeChatId) {
            handleNewChat();
        }
    };

    const handleSend = async (customText) => {
        const text = (customText != null ? customText : inputText).trim();
        if (!text || isSending) return;

        setIsSending(true);
        setLastUserMessage(text);
        setInputText('');
        closeMobileSidebar();

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const userMsg = {
            id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
            sender: 'user',
            text,
            time
        };

        // Determine or create conversation ID
        let convId = activeChatId;
        if (!convId) {
            convId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            setActiveChatId(convId);
        }

        // Optimistically append user message to current view
        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
        setIsTyping(true);

        // Update conversation list with user message
        setConversations((prev) => {
            let conv = prev.find((c) => c.id === convId);
            if (!conv) {
                conv = {
                    id: convId,
                    title: text.slice(0, 60),
                    messages: [userMsg],
                    updatedAt: Date.now()
                };
                return [conv, ...prev.filter((c) => c.id !== convId)];
            }
            const nextConv = {
                ...conv,
                messages: [...(conv.messages || []), userMsg],
                updatedAt: Date.now()
            };
            return [nextConv, ...prev.filter((c) => c.id !== convId)];
        });

        // Prepare context turns for the backend
        const historyContext = updatedMessages
            .slice(0, -1)
            .slice(-HISTORY_TURNS_LIMIT)
            .map((m) => ({ role: m.sender, content: m.text }));

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    history: historyContext,
                    language: currentLanguage
                })
            });

            setIsTyping(false);

            if (res.ok) {
                const data = await res.json();
                const replyTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const aiMsg = {
                    id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5),
                    sender: 'assistant',
                    text: data.answer || '',
                    time: replyTime
                };

                setMessages((prev) => [...prev, aiMsg]);

                setConversations((prev) => {
                    return prev.map((c) => {
                        if (c.id === convId) {
                            return {
                                ...c,
                                messages: [...(c.messages || []), aiMsg],
                                updatedAt: Date.now()
                            };
                        }
                        return c;
                    });
                });
            } else {
                let errorMsg = 'A server error occurred. Please try again.';
                if (res.status === 429) {
                    errorMsg = 'Rate limit exceeded. Please wait a moment and try again.';
                } else {
                    const err = await res.json().catch(() => ({}));
                    if (err.error || err.message || err.detail) {
                        errorMsg = err.error || err.message || err.detail;
                    }
                }

                const errTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const errBubble = {
                    id: 'msg-' + Date.now() + '-err',
                    sender: 'assistant',
                    text: errorMsg,
                    time: errTime,
                    isError: true
                };
                setMessages((prev) => [...prev, errBubble]);
            }
        } catch (err) {
            console.error('Chat error:', err);
            setIsTyping(false);
            const errTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const errBubble = {
                id: 'msg-' + Date.now() + '-err',
                sender: 'assistant',
                text: 'Could not reach the server. Check your connection and try again.',
                time: errTime,
                isError: true
            };
            setMessages((prev) => [...prev, errBubble]);
        } finally {
            setIsSending(false);
        }
    };

    const handleSelectChip = (chipText) => {
        handleSend(chipText);
    };

    const handleEditSubmit = (msgIndex, newText) => {
        // Keep messages up to edited index
        const remaining = messages.slice(0, msgIndex);
        setMessages(remaining);

        if (activeChatId) {
            setConversations((prev) => {
                return prev.map((c) => {
                    if (c.id === activeChatId) {
                        const newMsgList = (c.messages || []).slice(0, msgIndex);
                        return {
                            ...c,
                            title: msgIndex === 0 ? newText.slice(0, 60) : c.title,
                            messages: newMsgList,
                            updatedAt: Date.now()
                        };
                    }
                    return c;
                });
            });
        }

        handleSend(newText);
    };

    const handleRetry = () => {
        if (lastUserMessage) {
            handleSend(lastUserMessage);
        }
    };

    const handleFeedback = (msgIndex, feedbackType) => {
        setMessages((prev) => {
            const next = [...prev];
            if (next[msgIndex]) {
                next[msgIndex] = { ...next[msgIndex], feedback: feedbackType };
            }
            return next;
        });

        if (activeChatId) {
            setConversations((prev) => {
                return prev.map((c) => {
                    if (c.id === activeChatId) {
                        const updatedList = [...(c.messages || [])];
                        if (updatedList[msgIndex]) {
                            updatedList[msgIndex] = { ...updatedList[msgIndex], feedback: feedbackType };
                        }
                        return { ...c, messages: updatedList };
                    }
                    return c;
                });
            });
        }
    };

    // ── 7. Render Layout ──────────────────────────────────────────────────────
    const appShellClasses = [
        'app-shell',
        isSidebarCollapsed ? 'sidebar-collapsed' : '',
        isResizing ? 'is-resizing' : ''
    ].filter(Boolean).join(' ');

    return (
        <>
            <window.GUNi.BackgroundCanvas />
            <div
                className={appShellClasses}
                style={{ '--sidebar-w': `${sidebarWidth}px` }}
            >
                <window.GUNi.Sidebar
                    isOpenMobile={isMobileSidebarOpen}
                    onCloseMobile={closeMobileSidebar}
                    onToggleSidebar={toggleSidebar}
                    onNewChat={handleNewChat}
                    conversations={conversations}
                    activeId={activeChatId}
                    onSelectChat={handleSelectChat}
                    onDeleteChat={handleDeleteChat}
                    user={user}
                    onLogout={handleLogout}
                    t={t}
                    onStartResize={handleStartResize}
                    onResetWidth={handleResetSidebarWidth}
                />
                <window.GUNi.ChatPanel
                    onToggleSidebar={toggleSidebar}
                    currentLanguage={currentLanguage}
                    onLanguageChange={handleLanguageChange}
                    t={t}
                    messages={messages}
                    isTyping={isTyping}
                    onSelectChip={handleSelectChip}
                    onEditSubmit={handleEditSubmit}
                    onRetry={handleRetry}
                    isSending={isSending}
                    inputText={inputText}
                    setInputText={setInputText}
                    onSend={() => handleSend()}
                    onFeedback={handleFeedback}
                />
            </div>
        </>
    );
};

// Mount to DOM root
(function mountApp() {
    const rootEl = document.getElementById('root');
    if (rootEl && window.ReactDOM) {
        const root = ReactDOM.createRoot(rootEl);
        root.render(<window.GUNi.App />);
    }
})();

