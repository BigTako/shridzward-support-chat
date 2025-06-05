import { TMessagePopulated } from '@/lib/type';
import { useMemo } from 'react';

interface ChatMessageProps {
  message: TMessagePopulated;
  isOwnMessage: boolean;
}

const ChatMessage = ({ message, isOwnMessage }: ChatMessageProps) => {
  const { sender, type, text } = message;

  const isSystemMessage = type === 'system';
  const messageStyleMap = useMemo(
    () => ({
      system: 'bg-gray-800 text-white text-center text-xs',
      ['agent-only']: 'bg-orange-500 text-white',
      ['client-only']: 'bg-green-400 text-white',
      own: 'bg-blue-500 text-white',
      opponent: 'bg-white text-black',
    }),
    []
  );

  const messageType = isOwnMessage
    ? 'own'
    : type === 'user'
    ? 'opponent'
    : (type as keyof typeof messageStyleMap);

  console.log({ text: message.text, messageType });
  return (
    <div
      className={`flex ${
        isSystemMessage
          ? 'justify-center '
          : isOwnMessage
          ? 'justify-end'
          : 'justify-start'
      } p-2`}
    >
      <div
        className={`shadow-[0px_0px_8px_0px_rgba(0,0,0,0.25)] max-w-xs px-4 py-2 rounded-lg ${messageStyleMap[messageType]}`}
      >
        {!isSystemMessage && (
          <p className='text-sm font-bold'>{sender?.username}</p>
        )}
        <p className='whitespace-pre-wrap'>{text}</p>
      </div>
    </div>
  );
};

export default ChatMessage;
