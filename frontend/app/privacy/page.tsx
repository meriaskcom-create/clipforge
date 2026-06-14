import LegalPage from "../components/LegalPage";

export default function Page() {
  return (
    <LegalPage
      eyebrow="Privacy Policy"
      title="Privacy Policy"
      description="ClipForge user data, uploaded assets, projects and billing-related information ko kaise handle karta hai."
      sections={[
        { title: "Information We Collect", body: "We may collect account information such as name, email, project details, YouTube URLs, uploaded assets for branding, processing usage and billing-related metadata." },
    { title: "How We Use Information", body: "Information is used to create accounts, process videos, generate clips, manage subscriptions, provide downloads and improve the product experience." },
    { title: "Files and Processing", body: "Uploaded files, generated clips and ZIP downloads may be stored temporarily for download access and cleanup after expiry based on the active plan." },
    { title: "Payments", body: "Paid plan payments are processed through payment gateway integrations. ClipForge does not store full card or bank details in the application." },
    { title: "Data Retention", body: "Generated files may expire after the configured download window. Account and subscription data may be retained for operational, compliance and support purposes." },
    { title: "Contact", body: "For privacy-related queries, contact the ClipForge support team using the contact page." }
      ]}
    />
  );
}
