import { TMessage } from '@/lib/type';
import { useMemo } from 'react';

interface ChatMessageProps {
  message: TMessage;
  isOwnMessage: boolean;
}

const ChatMessage = ({ message, isOwnMessage }: ChatMessageProps) => {
  const { from, type, text } = message;

  const isSystemMessage = type === 'system';
  const messageStyleMap = useMemo(
    () => ({
      system: 'bg-gray-800 text-white text-center text-xs',
      context: 'bg-orange-500 text-white',
      own: 'bg-blue-500 text-white',
      opponent: 'bg-white text-black',
    }),
    []
  );

  const messageType = isOwnMessage
    ? 'own'
    : ['client', 'agent'].includes(type)
    ? 'opponent'
    : (type as keyof typeof messageStyleMap);
  return (
    <div
      className={`flex ${
        isSystemMessage
          ? 'justify-center '
          : isOwnMessage
          ? 'justify-end'
          : 'justify-start'
      } mb-3`}
    >
      <div
        className={`max-w-xs px-4 py-2 rounded-lg ${messageStyleMap[messageType]}`}
      >
        {!isSystemMessage && (
          <p className='text-sm font-bold'>{from.username}</p>
        )}
        <p>{text}</p>
      </div>
    </div>
  );
};

export default ChatMessage;
