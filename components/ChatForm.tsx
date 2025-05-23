'use client';

import { useState } from 'react';

const ChatForm = ({
  onSendMessage,
  placeholder,
}: {
  placeholder?: string;
  onSendMessage: (message: string) => void;
}) => {
  const [message, setMessage] = useState('');
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() !== '') {
      onSendMessage(message);
      setMessage('');
    }
    console.log('SUbmitted');
  };
  return (
    <form onSubmit={handleSubmit} className='max-w-full flex gap-2'>
      <input
        type='text'
        placeholder={placeholder || 'Type text...'}
        className='flex-1 px-4 border-2 py-2 rounded-lg focus:outline-none'
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <button
        type='submit'
        className='px-4 py-2 rounded-lg text-white bg-blue-500'
      >
        Send
      </button>
    </form>
  );
};

export default ChatForm;
