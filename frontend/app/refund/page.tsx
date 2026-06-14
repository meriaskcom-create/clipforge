import LegalPage from "../components/LegalPage";

export default function Page() {
  return (
    <LegalPage
      eyebrow="Refund Policy"
      title="Refund Policy"
      description="Paid plan, subscription aur payment-related refund rules."
      sections={[
        { title: "Digital Service", body: "ClipForge provides digital processing and SaaS access. Once a paid plan is activated and usage starts, refunds may be limited." },
    { title: "Eligible Refund Cases", body: "Refunds may be considered for duplicate payments, payment success but plan not activated, or technical issues where service access was not provided." },
    { title: "Non-refundable Cases", body: "Refunds may not be provided for change of mind, incorrect video/content, user-side internet issues, or after substantial usage of processing hours." },
    { title: "Request Timeline", body: "Refund requests should be submitted within a reasonable period after payment with payment ID, account email and issue details." },
    { title: "Processing Time", body: "Approved refunds may take time depending on the payment gateway and banking process." }
      ]}
    />
  );
}
