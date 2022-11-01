cd /home/cisco/Downloads
mkdir PracticeDir
cd PracticeDir
echo "This is test 1" > file1.txt
echo "This is test 2" > file2.txt
cd ..
jacksum -a MD2 -d /home/cisco/Downloads/PracticeDir > OriginalFileHashes.txt
cd PracticeDir
echo "This is test 3" > file2.txt
