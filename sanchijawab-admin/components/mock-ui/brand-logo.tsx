import {
  siSlack,
  siZendesk,
  siHubspot,
  siShopify,
  siWordpress,
  siSalesforce,
  siNotion,
  siWebflow,
  siZapier,
  siDiscord,
  siIntercom,
  siZoho,
  type SimpleIcon,
} from "simple-icons";

export const integrationBrands = [
  { icon: siSlack, label: "Slack" },
  { icon: siZendesk, label: "Zendesk" },
  { icon: siHubspot, label: "HubSpot" },
  { icon: siIntercom, label: "Intercom" },
  { icon: siShopify, label: "Shopify" },
  { icon: siWordpress, label: "WordPress" },
  { icon: siSalesforce, label: "Salesforce" },
  { icon: siNotion, label: "Notion" },
  { icon: siWebflow, label: "Webflow" },
  { icon: siZapier, label: "Zapier" },
  { icon: siZoho, label: "Zoho Desk" },
  { icon: siDiscord, label: "Discord" },
] satisfies { icon: SimpleIcon; label: string }[];

export function BrandLogo({ icon, className }: { icon: SimpleIcon; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={`#${icon.hex}`}
      role="img"
      aria-label={icon.title}
    >
      <path d={icon.path} />
    </svg>
  );
}
