import OwnerEnquiries from "@/components/private-tours/OwnerEnquiries";

export default function OwnerPage() {
  return (
    <section className="pt-hero pt-wrap">
      <p className="pt-kicker">Owner view (staging)</p>
      <h1 style={{ marginTop: 8 }}>Quote enquiries</h1>
      <p className="lead">Enquiries sent from the staging preview. Records are deleted automatically after 30 days. Your owner key stays in this browser tab only.</p>
      <OwnerEnquiries />
    </section>
  );
}
