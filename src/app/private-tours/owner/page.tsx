import OwnerEnquiries from "@/components/private-tours/OwnerEnquiries";

export const metadata = { title: "Owner enquiries", robots: { index: false, follow: false } };

export default function OwnerPage() {
  return (
    <section className="pt-hero pt-wrap">
      <p className="pt-kicker">Owner view</p>
      <h1 style={{ marginTop: 8 }}>Quote enquiries</h1>
      <p className="lead">Private Tours enquiries. Records are deleted automatically after 30 days. Your owner key stays in this browser tab only.</p>
      <OwnerEnquiries />
    </section>
  );
}
