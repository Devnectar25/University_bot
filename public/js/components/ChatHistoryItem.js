// ChatHistoryItem.js - Single chat history item with hover delete action
window.GUNi = window.GUNi || {};

window.GUNi.ChatHistoryItem = function ChatHistoryItem({ conversation, isActive, onSelect, onDelete }) {
    return (
        <div className="history-row">
            <button
                type="button"
                className={`history-item${isActive ? ' active' : ''}`}
                title={conversation.title}
                onClick={() => onSelect(conversation.id)}
            >
                <i className="bi bi-chat-left-text"></i>
                <span className="history-title">{conversation.title}</span>
            </button>
            <button
                type="button"
                className="history-delete"
                title="Delete chat"
                aria-label="Delete chat"
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conversation.id);
                }}
            >
                <i className="bi bi-trash3"></i>
            </button>
        </div>
    );
};

