'use client';
import { TSupportChatShorting } from '@/lib/type';
import Image from 'next/image';

type Props = {
  chat: TSupportChatShorting;
  onNameClick: () => void;
};

export function ChatCard({ chat, onNameClick }: Props) {
  const from = chat.lastMessage?.sender?.username || 'Anonymous';
  const lastMessage = chat.lastMessage?.text || '...';
  console.log({ chat });
  return (
    <div className='flex flex-col gap-3 justify-center p-2 border-[1px] border-black rounded-lg'>
      <div className='flex gap-2'>
        <Image
          className='h-[50px] w-[50px] rounded-full'
          src='https://www.assuropoil.fr/wp-content/uploads/2023/07/avoir-un-chat-sante.jpg'
          alt='Client image'
          width={540}
          height={840}
        />
        <div className='flex-1 flex flex-col gap-1 max-w-full truncate text-start'>
          <h3 className='font-bold cursor-pointer' onClick={onNameClick}>
            Room: {chat.id}
          </h3>
          <h3 className='truncate text-ellipsis max-w-full'>
            <strong>{from}:</strong> {lastMessage}
            {/* {fromMapping[chat.from as FromType]}: {chat.lastMessage} */}
          </h3>
        </div>
      </div>
    </div>
  );
}
