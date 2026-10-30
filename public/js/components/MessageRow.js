// MessageRow.js - Chat bubble for user and AI messages with markdown, inline editing and feedback
window.GUNi = window.GUNi || {};

const { useState, useEffect, useRef } = React;

window.GUNi.MessageRow = function MessageRow({
    message,
    index,
    onEditSubmit,
    onRetry,
    isSending,
    onFeedback
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(message.text || '');
    const textareaRef = useRef(null);

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
                        <strong>Request Failed.</strong>
                        <br />
                        <span>{message.text}</span>
                        {onRetry && (
                            <button
                                type="button"
                                onClick={onRetry}
                                style={{
                                    marginTop: '0.6rem',
                                    display: 'block',
                                    background: 'rgba(239,68,68,0.08)',
                                    border: '1px solid rgba(239,68,68,0.25)',
                                    borderRadius: '8px',
                                    padding: '4px 12px',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                    color: '#dc2626'
                                }}
                            >
                                <i className="bi bi-arrow-clockwise"></i> Retry
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

    // User message row (no ME avatar)
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
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="msg-edit-send"
                                    onClick={handleSaveEdit}
                                    disabled={isSending}
                                >
                                    <i className="bi bi-send-fill"></i> Send
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
                                        title="Edit question"
                                        aria-label="Edit question"
                                        onClick={() => setIsEditing(true)}
                                    >
                                        <i className="bi bi-pencil"></i> Edit
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    }

    // Assistant message row with Markdown and Like / Dislike feedback buttons
    const parsedHtml = window.marked ? window.marked.parse(message.text || '') : message.text;
    const currentFeedback = message.feedback || null;

    return (
        <div className="msg-row assistant">
            <div className="msg-body">
                <div
                    className="msg-bubble"
                    dangerouslySetInnerHTML={{ __html: parsedHtml }}
                />
                <div className="msg-meta">
                    <span className="msg-time">{message.time}</span>
                    <div className="msg-actions">
                        <button
                            type="button"
                            className={`msg-action-btn${currentFeedback === 'like' ? ' active-like' : ''}`}
                            title="Helpful (Like)"
                            aria-label="Like response"
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
                            title="Not helpful (Dislike)"
                            aria-label="Dislike response"
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
                    </div>
                </div>
            </div>
        </div>
    );
};
