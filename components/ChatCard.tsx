'use client';
import { fromMapping } from '@/lib/const';
import { TRoom } from '@/lib/type';
import { FromType } from '@/server.mjs';
import Image from 'next/image';
import Link from 'next/link';

export function ChatCard({
  chat,
  chatLinkType = 'client',
}: {
  chat: TRoom;
  chatLinkType?: 'client' | 'agent';
}) {
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
          <Link
            href={
              chatLinkType === 'client'
                ? `/?room=${chat.roomId}`
                : `/agent/?room=${chat.roomId}`
            }
          >
            <h3 className='font-bold'>Room: {chat.roomId}</h3>
          </Link>
          <h3 className='truncate text-ellipsis max-w-full'>
            {fromMapping[chat.from as FromType]}: {chat.lastMessage}
          </h3>
        </div>
      </div>
    </div>
  );
}
