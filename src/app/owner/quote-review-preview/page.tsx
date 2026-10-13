import type { Metadata } from 'next';
import QuoteReviewPreview from './QuoteReviewPreview';
export const metadata: Metadata = {title:'Expired quote dashboard preview',robots:{index:false,follow:false}};
export default function Page() {return <QuoteReviewPreview />;}
