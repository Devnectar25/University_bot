// Sidebar.js - Main sidebar navigation panel containing brand, chats, user card and resizer handle
window.GUNi = window.GUNi || {};

window.GUNi.Sidebar = function Sidebar({
    isOpenMobile,
    onCloseMobile,
    onToggleSidebar,
    onNewChat,
    conversations,
    activeId,
    onSelectChat,
    onDeleteChat,
    user,
    onLogout,
    t,
    onStartResize,
    onResetWidth
}) {
    return (
        <>
            {/* Backdrop overlay for mobile drawer */}
            <div
                className={`sidebar-backdrop${isOpenMobile ? ' show' : ''}`}
                id="sidebar-backdrop"
                onClick={onCloseMobile}
            ></div>

            <aside className={`sidebar${isOpenMobile ? ' open' : ''}`} id="sidebar">
                <window.GUNi.SidebarBrand onToggleSidebar={onToggleSidebar} />

                <button
                    type="button"
                    className="new-chat-btn"
                    id="new-chat-btn"
                    onClick={onNewChat}
                >
                    <i className="bi bi-plus-lg"></i> {t?.newChat || 'New chat'}
                </button>

                <div className="sidebar-label">{t?.recentChats || 'Recent Chats'}</div>

                <window.GUNi.ChatHistoryList
                    conversations={conversations}
                    activeId={activeId}
                    onSelect={onSelectChat}
                    onDelete={onDeleteChat}
                    t={t}
                />

                <window.GUNi.UserCard user={user} onLogout={onLogout} />

                {/* Draggable handle for adjusting sidebar width on desktop */}
                <div
                    className="sidebar-resizer"
                    onMouseDown={onStartResize}
                    onDoubleClick={onResetWidth}
                    title="Drag to resize sidebar width (double-click to reset)"
                    aria-label="Resize sidebar"
                ></div>
            </aside>
        </>
    );
};
