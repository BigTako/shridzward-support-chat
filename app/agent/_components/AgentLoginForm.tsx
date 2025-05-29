'use client';

import { socket } from '@/lib/socketClient';
import { AuthResponcePayload, TSupportUser } from '@/lib/type';
import { useState } from 'react';
import toast from 'react-hot-toast';

export function AgentLoginForm({
  onSuccess,
}: {
  onSuccess: (user: TSupportUser) => void;
}) {
  const handleLogin = async (username: string, password: string) => {
    const result = (await socket.emitWithAck('login', {
      username,
      type: 'agent',
      password,
    })) as AuthResponcePayload;

    if (result) {
      if (result.status === 'success' && result._meta) {
        onSuccess(result._meta.user);
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    }
  };

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className='flex flex-col gap-4 w-[500px] text-center'>
      <h2 className='text-[24px] font-bold'>Login</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          console.log('submit');
          await handleLogin(username, password);
        }}
        className='w-full flex flex-col gap-3'
      >
        <input
          type='text'
          placeholder='Enter username'
          className='flex-1 px-4 border-2 py-2 rounded-lg focus:outline-none'
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type='text'
          placeholder='Enter password'
          className='flex-1 px-4 border-2 py-2 rounded-lg focus:outline-none'
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type='submit'
          className='px-4 py-2 rounded-lg text-white bg-blue-500'
        >
          Submit
        </button>
      </form>
    </div>
  );
}
