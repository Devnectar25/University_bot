// SidebarBrand.js - University logo, branding and collapse/close toggle
window.GUNi = window.GUNi || {};

window.GUNi.SidebarBrand = function SidebarBrand({ onToggleSidebar }) {
    return (
        <div className="brand">
            <a
                href="https://www.ganpatuniversity.ac.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="brand-link"
                title="Visit official Ganpat University website (ganpatuniversity.ac.in)"
            >
                <div className="brand-icon">
                    <img
                        src="/images/guni-crest.png"
                        alt="Ganpat University Logo"
                        className="brand-logo-img"
                    />
                </div>
                <div className="brand-titles">
                    <div className="brand-name">GUNi Assistant</div>
                    <div className="brand-sub">Ganpat University, Mehsana</div>
                </div>
            </a>
            <button
                type="button"
                className="sidebar-toggle-btn"
                id="sidebar-collapse-btn"
                title="Hide sidebar"
                aria-label="Hide sidebar"
                onClick={onToggleSidebar}
            >
                <i className="bi bi-layout-sidebar-inset"></i>
                <i className="bi bi-x-lg"></i>
            </button>
        </div>
    );
};

