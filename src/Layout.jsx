import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import { Menu } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { WorkflowProvider } from "./components/WorkflowContext";
import { Toaster } from "@/components/ui/sonner";

export default function Layout({ children, currentPageName }) {
  return (
    <WorkflowProvider>
      <div className="min-h-screen bg-[#F6EFE7]" style={{ fontFamily: "'Sohne', 'Inter', sans-serif" }}>
        <style>
          {`
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
          `}
        </style>

        {/* Navigation Menu */}
        <div className="absolute top-6 right-6 z-50">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="bg-black/10 hover:bg-black/20 backdrop-blur-sm rounded-xl"
              >
                <Menu className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link to={createPageUrl("Home")} className="cursor-pointer">
                  Home
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={createPageUrl("InteractionsReasoning")} className="cursor-pointer">
                  Interactions & Reasoning
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={createPageUrl("SendMessage")} className="cursor-pointer">
                  Validated Leads
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={createPageUrl("ClientDatabase")} className="cursor-pointer">
                  Client Database
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {children}
        <Toaster position="top-center" />
      </div>
    </WorkflowProvider>
  );
}