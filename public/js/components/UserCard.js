// UserCard.js - User profile display at bottom of sidebar (Guest / Signed-in)
window.GUNi = window.GUNi || {};

window.GUNi.UserCard = function UserCard({ user }) {
    const isLoggedIn = !!(user && (user.name || user.username));
    const displayName = isLoggedIn ? (user.name || user.username) : 'Guest';
    const displayEmail = isLoggedIn ? (user.email || user.username) : '';
    const avatarLetter = displayName.charAt(0).toUpperCase();

    return (
        <div className="user-card">
            <div className="user-avatar" id="user-avatar">
                {isLoggedIn ? avatarLetter : <i className="bi bi-person-fill"></i>}
            </div>
            <div className="user-info">
                <div className="user-name" id="user-name">{displayName}</div>
                <div className="user-email" id="user-email">{displayEmail}</div>
            </div>
        </div>
    );
};
