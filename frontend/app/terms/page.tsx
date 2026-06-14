import LegalPage from "../components/LegalPage";

export default function Page() {
  return (
    <LegalPage
      eyebrow="Terms & Conditions"
      title="Terms & Conditions"
      description="ClipForge use karne ke basic rules, account responsibilities aur service terms."
      sections={[
        { title: "Use of Service", body: "ClipForge is a video clipping and branding tool. Users are responsible for ensuring they have rights or permission to process the videos and assets they use." },
    { title: "Account Responsibility", body: "You are responsible for keeping your login details secure and for all activity performed through your account." },
    { title: "Content Responsibility", body: "You must not use ClipForge for illegal, copyrighted, harmful, misleading or abusive content processing." },
    { title: "Subscription and Usage", body: "Plans may include processing limits, download expiry windows and feature restrictions. Usage can be tracked and limited based on plan rules." },
    { title: "Service Availability", body: "Processing speed and availability may depend on queue load, video length, third-party services, server capacity and internet connectivity." },
    { title: "Changes", body: "ClipForge may update features, pricing, terms and policies when required. Continued use means acceptance of updated terms." }
      ]}
    />
  );
}
