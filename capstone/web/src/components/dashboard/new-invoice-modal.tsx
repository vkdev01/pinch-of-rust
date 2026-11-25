"use client";

import {useState} from "react";
import {Button, Input, Label, ListBox, Modal, Select} from "@heroui/react";

import {PlusIcon} from "@/components/dashboard/icons";

const planOptions = ["Starter", "Growth", "Scale", "Enterprise"] as const;

export function NewInvoiceModal() {
  const [plan, setPlan] = useState<string>("Growth");

  return (
    <Modal>
      <Button variant="primary">
        <PlusIcon className="size-4" />
        New invoice
      </Button>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[480px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>New invoice</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className="app-stack">
                <Input aria-label="Customer name" placeholder="Acme Corp" />
                <Input aria-label="Amount in USD" placeholder="4800" type="number" />
                <Select
                  className="w-full"
                  selectedKey={plan}
                  onSelectionChange={(key) => {
                    if (key != null) setPlan(String(key));
                  }}
                >
                  <Label>Plan</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {planOptions.map((option) => (
                        <ListBox.Item id={option} key={option} textValue={option}>
                          {option}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                Cancel
              </Button>
              <Button slot="close">Create invoice</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
