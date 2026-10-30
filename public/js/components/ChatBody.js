// ChatBody.js - Scrollable chat container with welcome view or conversation history
window.GUNi = window.GUNi || {};

const { useEffect, useRef } = React;

window.GUNi.ChatBody = function ChatBody({
    messages,
    isTyping,
    t,
    onSelectChip,
    onEditSubmit,
    onRetry,
    isSending,
    onFeedback
}) {
    const chatBodyRef = useRef(null);
    const prevMessagesLength = useRef(0);

    // Auto-scroll logic
    useEffect(() => {
        if (!chatBodyRef.current) return;
        const container = chatBodyRef.current;

        // If a new message arrived
        if (messages.length > prevMessagesLength.current) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastMsg.sender === 'assistant') {
                // Scroll to top of the assistant's answer for comfortable reading
                const rows = container.querySelectorAll('.msg-row');
                const lastRow = rows[rows.length - 1];
                if (lastRow) {
                    const offset = lastRow.getBoundingClientRect().top - container.getBoundingClientRect().top;
                    container.scrollTo({ top: container.scrollTop + offset - 16, behavior: 'smooth' });
                }
            } else {
                container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
            }
        } else if (isTyping) {
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        }
        prevMessagesLength.current = messages.length;
    }, [messages, isTyping]);

    const hasMessages = messages && messages.length > 0;

    return (
        <div className="chat-body" id="chat-body" ref={chatBodyRef}>
            {!hasMessages ? (
                <window.GUNi.WelcomeCard t={t} onSelectChip={onSelectChip} />
            ) : (
                <>
                    {messages.map((msg, idx) => (
                        <window.GUNi.MessageRow
                            key={msg.id || idx}
                            index={idx}
                            message={msg}
                            onEditSubmit={onEditSubmit}
                            onRetry={onRetry}
                            isSending={isSending}
                            onFeedback={onFeedback}
                        />
                    ))}
                    {isTyping && <window.GUNi.TypingIndicator />}
                </>
            )}
        </div>
    );
};
