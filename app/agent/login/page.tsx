'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { socket } from '@/lib/socketClient';
import toast from 'react-hot-toast';
export default function AgentLoginPage() {
  const router = useRouter();

  useEffect(() => {
    if (window) {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user && user.type === 'agent') {
        router.push('/agent');
      }
    }
  }, [router]);

  const handleLogin = async (username: string, password: string) => {
    const result = (await socket.emitWithAck('agent-login', {
      username,
      password,
    })) as {
      status: 'success' | 'error';
      message: string;
    };

    if (result && result.status === 'success' && window) {
      const user = JSON.stringify({ type: 'agent', username });
      localStorage.setItem('user', user);
      const id = toast.success(result.message);
      setTimeout(() => {
        toast.remove(id);
        router.push('/agent');
      }, 1500);
    } else {
      toast.error(result.message);
    }
  };

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  return (
    <div className='flex mt-24 justify-center w-full'>
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
    </div>
  );
}
