import LegalPage from "../components/LegalPage";

export default function Page() {
  return (
    <LegalPage
      eyebrow="Disclaimer"
      title="Disclaimer"
      description="ClipForge ke output, third-party videos aur generated clips ke baare me important information."
      sections={[
        { title: "No Ownership Claim", body: "ClipForge does not claim ownership of YouTube videos, uploaded assets or generated clips. Ownership remains with the respective rights holders." },
    { title: "User Responsibility", body: "Users are responsible for ensuring they have the right to process, edit, brand and publish content generated through ClipForge." },
    { title: "Third-party Dependencies", body: "Processing may depend on third-party platforms, APIs, payment gateways, hosting, queues and video processing tools." },
    { title: "Output Quality", body: "Output quality can vary based on original video quality, selected settings, aspect ratio, uploaded assets and processing limitations." },
    { title: "No Guaranteed Results", body: "ClipForge provides tools for content creation but does not guarantee views, revenue, subscriber growth or social media performance." }
      ]}
    />
  );
}
