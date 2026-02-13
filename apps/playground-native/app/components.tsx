import { useState } from 'react';
import { View, Text, ScrollView, Alert } from 'react-native';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
  Label,
  Checkbox,
  Avatar,
  AvatarImage,
  AvatarFallback,
  Spinner,
  Select,
  Separator,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Modal,
  ModalContent,
  ModalHeader,
  ModalFooter,
} from '@jaw/ui-native';
import { formatAddress } from '@jaw/ui-native';
import { WalletIcon, CopyIcon, LockIcon } from '@jaw/ui-native';

export default function ComponentsScreen() {
  const [inputValue, setInputValue] = useState('');
  const [checked, setChecked] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const networks = [
    { label: 'Ethereum', value: 'ethereum' },
    { label: 'Arbitrum', value: 'arbitrum' },
    { label: 'Base', value: 'base' },
    { label: 'Optimism', value: 'optimism' },
  ];

  const handleButtonClick = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      Alert.alert('Success', 'Button clicked!');
    }, 1500);
  };

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-4 gap-4">
        {/* Buttons Section */}
        <Card>
          <CardHeader>
            <CardTitle>Buttons</CardTitle>
          </CardHeader>
          <CardContent className="gap-3">
            <Button onPress={handleButtonClick} isLoading={loading}>
              Default Button
            </Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button disabled>Disabled</Button>
          </CardContent>
        </Card>

        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle>Inputs</CardTitle>
          </CardHeader>
          <CardContent className="gap-3">
            <View className="gap-2">
              <Label>Username</Label>
              <Input
                placeholder="Enter username"
                value={inputValue}
                onChangeText={setInputValue}
              />
            </View>
            <View className="gap-2">
              <Label>With Icons</Label>
              <Input
                placeholder="Search..."
                left={<WalletIcon width={18} height={18} />}
                right={<CopyIcon width={14} height={14} />}
              />
            </View>
            <View className="gap-2">
              <Label>Password</Label>
              <Input
                placeholder="Enter password"
                secureTextEntry
                left={<LockIcon width={16} height={16} />}
              />
            </View>
          </CardContent>
        </Card>

        {/* Checkbox & Select Section */}
        <Card>
          <CardHeader>
            <CardTitle>Form Controls</CardTitle>
          </CardHeader>
          <CardContent className="gap-4">
            <View className="flex-row items-center gap-3">
              <Checkbox checked={checked} onCheckedChange={setChecked} />
              <Text className="text-foreground">
                Accept terms and conditions
              </Text>
            </View>

            <View className="gap-2">
              <Label>Select Network</Label>
              <Select
                value={selectedNetwork}
                onValueChange={setSelectedNetwork}
                options={networks}
                placeholder="Choose a network"
              />
            </View>
          </CardContent>
        </Card>

        {/* Avatar Section */}
        <Card>
          <CardHeader>
            <CardTitle>Avatars</CardTitle>
          </CardHeader>
          <CardContent className="flex-row gap-4">
            <Avatar size={48}>
              <AvatarImage src="https://github.com/shadcn.png" />
              <AvatarFallback>CN</AvatarFallback>
            </Avatar>
            <Avatar size={48}>
              <AvatarFallback>JD</AvatarFallback>
            </Avatar>
            <Avatar size={48}>
              <AvatarFallback>?</AvatarFallback>
            </Avatar>
          </CardContent>
        </Card>

        {/* Utilities Section */}
        <Card>
          <CardHeader>
            <CardTitle>Utilities</CardTitle>
          </CardHeader>
          <CardContent className="gap-3">
            <Text className="text-sm text-muted-foreground">
              formatAddress example:
            </Text>
            <Text className="text-foreground font-mono">
              {formatAddress('0x1234567890abcdef1234567890abcdef12345678')}
            </Text>

            <Separator className="my-2" />

            <View className="flex-row items-center gap-2">
              <Spinner />
              <Text className="text-foreground">Loading spinner</Text>
            </View>
          </CardContent>
        </Card>

        {/* Accordion Section */}
        <Card>
          <CardHeader>
            <CardTitle>Accordion</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              <AccordionItem value="item-1">
                <AccordionTrigger>What is JAW?</AccordionTrigger>
                <AccordionContent>
                  <Text className="text-muted-foreground">
                    JAW (JustaName Abstracted Wallet) is a smart account SDK
                    with passkey authentication.
                  </Text>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger>How does it work?</AccordionTrigger>
                <AccordionContent>
                  <Text className="text-muted-foreground">
                    JAW uses WebAuthn passkeys for secure authentication and
                    ERC-4337 smart accounts for transactions.
                  </Text>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* Modal Section */}
        <Card>
          <CardHeader>
            <CardTitle>Modal</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onPress={() => setModalOpen(true)}>Open Modal</Button>
          </CardContent>
        </Card>

        <Modal open={modalOpen} onOpenChange={setModalOpen}>
          <ModalHeader>
            <Text className="text-lg font-semibold text-foreground">
              Example Modal
            </Text>
          </ModalHeader>
          <ModalContent>
            <Text className="text-muted-foreground">
              This is an example modal dialog. You can put any content here.
            </Text>
          </ModalContent>
          <ModalFooter>
            <Button
              variant="outline"
              className="flex-1"
              onPress={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button className="flex-1" onPress={() => setModalOpen(false)}>
              Confirm
            </Button>
          </ModalFooter>
        </Modal>

        {/* Spacer at bottom */}
        <View className="h-8" />
      </View>
    </ScrollView>
  );
}
