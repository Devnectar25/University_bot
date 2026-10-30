// ChatHistoryList.js - List of recent conversations with view-more limit toggle
window.GUNi = window.GUNi || {};

const { useState } = React;

window.GUNi.ChatHistoryList = function ChatHistoryList({ conversations, activeId, onSelect, onDelete, t }) {
    const [showAll, setShowAll] = useState(false);
    const RECENT_LIMIT = 6;

    if (!conversations || conversations.length === 0) {
        return (
            <div className="history-list" id="history-list">
                <div className="history-empty">
                    {t?.noChats || 'No chats yet. Ask a question to start.'}
                </div>
            </div>
        );
    }

    const hasMore = conversations.length > RECENT_LIMIT;
    const itemsToDisplay = (hasMore && !showAll)
        ? conversations.slice(0, RECENT_LIMIT)
        : conversations;

    const moreCount = conversations.length - RECENT_LIMIT;

    return (
        <div className="history-list" id="history-list">
            {itemsToDisplay.map((conv) => (
                <window.GUNi.ChatHistoryItem
                    key={conv.id}
                    conversation={conv}
                    isActive={conv.id === activeId}
                    onSelect={onSelect}
                    onDelete={onDelete}
                />
            ))}

            {hasMore && (
                <button
                    type="button"
                    className="history-view-more-btn"
                    onClick={() => setShowAll((prev) => !prev)}
                >
                    {!showAll ? (
                        <>
                            <i className="bi bi-chevron-down"></i> {t?.viewMore || 'View more'} ({moreCount})
                        </>
                    ) : (
                        <>
                            <i className="bi bi-chevron-up"></i> {t?.showLess || 'Show less'}
                        </>
                    )}
                </button>
            )}
        </div>
    );
};

