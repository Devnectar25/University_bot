// ChatHeader.js - Top header with mobile menu trigger, status pulse and language selector
window.GUNi = window.GUNi || {};

window.GUNi.ChatHeader = function ChatHeader({ onToggleSidebar, currentLanguage, onLanguageChange, t }) {
    return (
        <header className="chat-header">
            <div className="header-left">
                <button
                    type="button"
                    className="icon-btn menu"
                    id="sidebar-toggle"
                    title="Toggle sidebar (Ctrl+B)"
                    aria-label="Toggle sidebar"
                    onClick={onToggleSidebar}
                >
                    <i className="bi bi-layout-sidebar"></i>
                </button>
                <div className="header-badge">
                    <span className="status-pulse-dot"></span>
                    <span className="header-badge-text" id="ui-header-title">
                        {t?.title || 'GUNi Assistant'}
                    </span>
                </div>
            </div>
            <div className="header-right">
                <window.GUNi.LanguageToggle
                    currentLanguage={currentLanguage}
                    onLanguageChange={onLanguageChange}
                />
            </div>
        </header>
    );
};

