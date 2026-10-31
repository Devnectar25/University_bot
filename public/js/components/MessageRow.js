// MessageRow.js - Chat bubble for user and AI messages with markdown, inline editing, copy, sources, and feedback
window.GUNi = window.GUNi || {};

const { useState, useEffect, useRef } = React;

window.GUNi.MessageRow = function MessageRow({
    message,
    index,
    onEditSubmit,
    onRetry,
    isSending,
    onRegenerate,
    isLatestAssistant,
    onFeedback,
    t
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(message.text || '');
    const [copied, setCopied] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const textareaRef = useRef(null);

    useEffect(() => {
        return () => {
            if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
        };
    }, []);

    const handleSpeak = () => {
        if (!window.speechSynthesis) return;

        if (isSpeaking) {
            window.speechSynthesis.cancel();
            setIsSpeaking(false);
            return;
        }

        window.speechSynthesis.cancel();
        const cleanSpeech = (message.text || '')
            .replace(/https?:\/\/\S+/g, '')
            .replace(/\[(.*?)\]\(.*?\)/g, '$1')
            .replace(/[*_#`~>|–-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!cleanSpeech) return;

        const utter = new SpeechSynthesisUtterance(cleanSpeech);
        if (message.language === 'hi' || /[\u0900-\u097F]/.test(cleanSpeech)) {
            utter.lang = 'hi-IN';
        } else if (message.language === 'gu' || /[\u0A80-\u0AFF]/.test(cleanSpeech)) {
            utter.lang = 'gu-IN';
        } else {
            utter.lang = 'en-IN';
        }

        utter.onend = () => setIsSpeaking(false);
        utter.onerror = () => setIsSpeaking(false);

        setIsSpeaking(true);
        window.speechSynthesis.speak(utter);
    };

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(
                textareaRef.current.value.length,
                textareaRef.current.value.length
            );
        }
    }, [isEditing]);

    const handleSaveEdit = () => {
        const trimmed = editText.trim();
        if (!trimmed || isSending) return;
        setIsEditing(false);
        onEditSubmit(index, trimmed);
    };

    const handleCancelEdit = () => {
        setEditText(message.text || '');
        setIsEditing(false);
    };

    const handleCopy = () => {
        if (!message.text) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(message.text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }).catch(() => { });
        } else {
            // Fallback for older browsers
            const ta = document.createElement('textarea');
            ta.value = message.text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSaveEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            handleCancelEdit();
        }
    };

    // Error state message
    if (message.isError) {
        return (
            <div className="msg-row assistant error">
                <div className="msg-body">
                    <div className="msg-bubble">
                        <strong>{t?.requestFailed || 'Request Failed.'}</strong>
                        <br />
                        <span>{message.text}</span>
                        {onRetry && (
                            <button
                                type="button"
                                onClick={onRetry}
                                className="msg-retry-btn"
                            >
                                <i className="bi bi-arrow-clockwise"></i> {t?.retry || 'Retry'}
                            </button>
                        )}
                    </div>
                    <div className="msg-meta">
                        <span className="msg-time">{message.time}</span>
                    </div>
                </div>
            </div>
        );
    }

    const isUser = message.sender === 'user';

    // User message row
    if (isUser) {
        return (
            <div className={`msg-row user${isEditing ? ' editing' : ''}`}>
                <div className="msg-body">
                    {isEditing ? (
                        <div className="msg-editor">
                            <textarea
                                ref={textareaRef}
                                className="msg-edit-input"
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                rows={Math.min(6, Math.max(2, editText.split('\n').length))}
                            />
                            <div className="msg-edit-actions">
                                <button
                                    type="button"
                                    className="msg-edit-cancel"
                                    onClick={handleCancelEdit}
                                >
                                    {t?.cancel || 'Cancel'}
                                </button>
                                <button
                                    type="button"
                                    className="msg-edit-send"
                                    onClick={handleSaveEdit}
                                    disabled={isSending}
                                >
                                    <i className="bi bi-send-fill"></i> {t?.saveSubmit || 'Save & Submit'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="msg-bubble">{message.text}</div>
                            <div className="msg-meta">
                                <span className="msg-time">{message.time}</span>
                                {index != null && !isSending && (
                                    <button
                                        type="button"
                                        className="msg-edit-btn"
                                        title={t?.edit || "Edit message"}
                                        aria-label={t?.edit || "Edit message"}
                                        onClick={() => setIsEditing(true)}
                                    >
                                        <i className="bi bi-pencil"></i> {t?.edit ? t.edit.split(' ')[0] : 'Edit'}
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    }

    // Assistant message row with Markdown, Sources, Copy and Feedback
    const parsedHtml = window.marked ? window.marked.parse(message.text || '') : message.text;
    const currentFeedback = message.feedback || null;

    // Deduplicate sources for clean display
    const uniqueSources = [];
    const seenTitles = new Set();
    if (Array.isArray(message.sources)) {
        for (const src of message.sources) {
            const title = src.page_title || src.sheet_name || '';
            if (title && !seenTitles.has(title) && title !== 'N/A' && title !== 'Unknown') {
                seenTitles.add(title);
                uniqueSources.push(src);
            }
        }
    }

    return (
        <div className="msg-row assistant">
            <div className="msg-body">
                <div
                    className="msg-bubble"
                    dangerouslySetInnerHTML={{ __html: parsedHtml }}
                />

                {/* Verified Official Sources */}
                {uniqueSources.length > 0 && (
                    <div className="msg-sources-strip">
                        <span className="msg-sources-title">
                            <i className="bi bi-shield-check"></i> {t?.sourcesLabel || 'Sources:'}
                        </span>
                        <div className="msg-sources-pills">
                            {uniqueSources.slice(0, 3).map((src, sIdx) => (
                                <a
                                    key={sIdx}
                                    href={src.url || 'https://www.ganpatuniversity.ac.in'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="source-pill"
                                    title={src.page_title}
                                >
                                    <span>{src.page_title}</span>
                                    <i className="bi bi-box-arrow-up-right"></i>
                                </a>
                            ))}
                        </div>
                    </div>
                )}

                <div className="msg-meta">
                    <span className="msg-time">{message.time}</span>
                    <div className="msg-actions">
                        <button
                            type="button"
                            className={`msg-action-btn${copied ? ' active-copied' : ''}`}
                            title={copied ? (t?.copied || "Copied") : (t?.copy || "Copy answer")}
                            aria-label={t?.copy || "Copy answer"}
                            onClick={handleCopy}
                        >
                            <i className={copied ? "bi bi-check2" : "bi bi-clipboard"}></i>
                            {copied && <span className="action-feedback-tag">{t?.copied || 'Copied'}</span>}
                        </button>
                        <button
                            type="button"
                            className={`msg-action-btn${isSpeaking ? ' active-speaking' : ''}`}
                            title={isSpeaking ? (t?.stopAudio || "Stop audio") : (t?.readAloud || "Read aloud (Audio TTS)")}
                            aria-label={isSpeaking ? (t?.stopAudio || "Stop audio") : (t?.readAloud || "Read aloud")}
                            onClick={handleSpeak}
                        >
                            <i className={isSpeaking ? "bi bi-volume-up-fill" : "bi bi-volume-up"}></i>
                        </button>
                        <button
                            type="button"
                            className={`msg-action-btn${currentFeedback === 'like' ? ' active-like' : ''}`}
                            title={t?.helpful || "Helpful (Like)"}
                            aria-label={t?.helpful || "Helpful (Like)"}
                            onClick={() =>
                                onFeedback &&
                                onFeedback(index, currentFeedback === 'like' ? null : 'like')
                            }
                        >
                            <i
                                className={
                                    currentFeedback === 'like'
                                        ? 'bi bi-hand-thumbs-up-fill'
                                        : 'bi bi-hand-thumbs-up'
                                }
                            ></i>
                        </button>
                        <button
                            type="button"
                            className={`msg-action-btn${currentFeedback === 'dislike' ? ' active-dislike' : ''}`}
                            title={t?.notHelpful || "Not helpful (Dislike)"}
                            aria-label={t?.notHelpful || "Not helpful (Dislike)"}
                            onClick={() =>
                                onFeedback &&
                                onFeedback(index, currentFeedback === 'dislike' ? null : 'dislike')
                            }
                        >
                            <i
                                className={
                                    currentFeedback === 'dislike'
                                        ? 'bi bi-hand-thumbs-down-fill'
                                        : 'bi bi-hand-thumbs-down'
                                }
                            ></i>
                        </button>
                        {onRegenerate && isLatestAssistant && !isSending && (
                            <button
                                type="button"
                                className="msg-action-btn"
                                title={t?.regenerate || "Regenerate response"}
                                aria-label={t?.regenerate || "Regenerate response"}
                                onClick={() => onRegenerate(index)}
                            >
                                <i className="bi bi-arrow-clockwise"></i>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
