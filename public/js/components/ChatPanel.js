// ChatPanel.js - Main right-hand panel wrapping Header, Body and Footer
window.GUNi = window.GUNi || {};

window.GUNi.ChatPanel = function ChatPanel({
    onToggleSidebar,
    currentLanguage,
    onLanguageChange,
    t,
    messages,
    isTyping,
    onSelectChip,
    onEditSubmit,
    onRetry,
    isSending,
    inputText,
    setInputText,
    onSend,
    onFeedback
}) {
    return (
        <main className="chat-panel">
            <window.GUNi.ChatHeader
                onToggleSidebar={onToggleSidebar}
                currentLanguage={currentLanguage}
                onLanguageChange={onLanguageChange}
                t={t}
            />

            <window.GUNi.ChatBody
                messages={messages}
                isTyping={isTyping}
                t={t}
                onSelectChip={onSelectChip}
                onEditSubmit={onEditSubmit}
                onRetry={onRetry}
                isSending={isSending}
                onFeedback={onFeedback}
            />

            <window.GUNi.ChatFooter
                inputText={inputText}
                setInputText={setInputText}
                onSend={onSend}
                isSending={isSending}
                t={t}
                currentLanguage={currentLanguage}
            />
        </main>
    );
};
