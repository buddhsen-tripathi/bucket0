import React from "react";

interface CloudWelcomeProps {
  error: string | null;
}

export default function CloudWelcome({ error }: CloudWelcomeProps) {
  return (
    <div className="text-center py-16">
      <div className="bg-card rounded-sm shadow-sm border border-border p-8 max-w-md mx-auto">
        <h2 className="text-xl font-semibold text-foreground mb-4">
          Welcome to Bucket0 Cloud
        </h2>
        {error ? (
          <>
            <p className="text-destructive mb-6">
              Unable to connect to Cloud Storage
            </p>
            <p className="text-sm text-muted-foreground">
              We&apos;re having trouble connecting. Please try again later or contact support if the issue persists.
            </p>
          </>
        ) : (
          <p className="text-muted-foreground mb-6">
            Connecting to your secure storage...
          </p>
        )}
      </div>
    </div>
  );
}
