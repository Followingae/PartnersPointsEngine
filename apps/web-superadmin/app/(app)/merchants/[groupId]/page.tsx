'use client';

import { useParams } from 'next/navigation';
import { MerchantDetailView } from '@/components/merchant-detail';

export default function MerchantPage() {
  const { groupId } = useParams<{ groupId: string }>();
  return <MerchantDetailView groupId={groupId} />;
}
